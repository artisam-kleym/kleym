/**
 * BIP39 recovery-phrase detection (#77).
 *
 * Every seed-leak guard in this codebase — `containsSecretSeed`, the
 * `NEXT_PUBLIC_` scan, the CI grep — matched `S[A-Z2-7]{55}`, a StrKey seed.
 * A recovery phrase matches none of them, and it is the most valuable secret
 * in the system: one phrase reconstructs every campaign derived from it. So
 * the moment a phrase exists, the guards have to know its shape too.
 *
 * Detection is by CHECKSUM, not by vocabulary alone. Twelve ordinary English
 * words in a row that happen to be in the wordlist ("this is a test of the
 * system that we all know and love") must not raise a false security event;
 * a phrase with a valid BIP39 checksum is one in 16 for twelve words and one
 * in 256 for twenty-four — and a real phrase always passes.
 *
 * This runs on every string of every guarded request body, including the
 * unauthenticated claim routes, so its cost is bounded by construction: the
 * checksum is computed here (a word→index Map and one SHA-256 over the
 * entropy per window — no per-window normalisation, no linear wordlist
 * search), and the number of windows a body can make it examine is capped.
 * A body past the cap is refused as implausible, not scanned harder: no
 * legitimate Kleym request holds thousands of consecutive wordlist words.
 *
 * No `client-only` / `server-only`: the server refuses a phrase in any body
 * and the page refuses to put one anywhere but React state.
 */
import { sha256 } from '@noble/hashes/sha2.js'
import { wordlist } from '@scure/bip39/wordlists/english.js'

/** Valid BIP39 lengths. Windows of any other size are not phrases. */
const PHRASE_LENGTHS = [12, 15, 18, 21, 24] as const
const SHORTEST = 12

/** Word → its 11-bit index, once. `wordlist.indexOf` per word is what made the old path slow. */
const INDEX = new Map<string, number>(wordlist.map((word, i) => [word, i]))

/**
 * Words that sit in a run long enough to hold a phrase, per scan. Each such
 * word costs at most five checksum windows; 4,096 of them is ~20k SHA-256s,
 * a few milliseconds. A 200-character label holds at most ~50 words; a body
 * that spends this budget is `zoo zoo zoo …`, not a campaign.
 */
export const DEFAULT_WORD_BUDGET = 4_096

/** A budget shared across every string of one body, so the cap is per request, not per field. */
export interface ScanBudget {
  words: number
}

export function scanBudget(words = DEFAULT_WORD_BUDGET): ScanBudget {
  return { words }
}

export type MnemonicScan = 'clean' | 'phrase' | 'over-budget'

/**
 * Whether `value` contains a BIP39 English phrase ANYWHERE — bare, inside a
 * sentence, across line breaks, or with punctuation between words. Matching
 * is case-insensitive because a phrase typed in Title Case is still a phrase.
 *
 * `over-budget` means the scan was cut short, not that a phrase was found:
 * the caller refuses the body as implausible without raising a security event.
 */
export function scanForMnemonic(value: unknown, budget: ScanBudget = scanBudget()): MnemonicScan {
  if (typeof value !== 'string' || value.length < SHORTEST * 4) return 'clean'
  const tokens = value.toLowerCase().split(/[^a-z]+/)

  // Walk runs of consecutive wordlist words; only a run of 12+ can hold a phrase.
  let run: number[] = []
  for (const token of [...tokens, '']) {
    const index = token === '' ? undefined : INDEX.get(token)
    if (index !== undefined) {
      run.push(index)
      continue
    }
    if (run.length >= SHORTEST) {
      budget.words -= run.length
      if (budget.words < 0) return 'over-budget'
      if (runHoldsPhrase(run)) return 'phrase'
    }
    run = []
  }
  return 'clean'
}

/** `scanForMnemonic` as a yes/no, without a budget — for source scans, not request bodies. */
export function containsMnemonic(value: unknown): boolean {
  return scanForMnemonic(value, scanBudget(Number.POSITIVE_INFINITY)) === 'phrase'
}

function runHoldsPhrase(run: number[]): boolean {
  for (const length of PHRASE_LENGTHS) {
    if (run.length < length) break
    for (let start = 0; start + length <= run.length; start += 1) {
      if (checksumHolds(run, start, length)) return true
    }
  }
  return false
}

/**
 * BIP39: `length` words carry `length × 11` bits — `ENT` bits of entropy
 * followed by `ENT / 32` bits of checksum, which must equal the leading bits
 * of SHA-256(entropy). Packed straight from the indices; no strings, no NFKD.
 */
function checksumHolds(run: number[], start: number, length: number): boolean {
  const totalBits = length * 11
  const checksumBits = totalBits / 33
  const entropyBytes = (totalBits - checksumBits) / 8
  const bytes = new Uint8Array(entropyBytes + 1)

  // Pack the 11-bit indices MSB-first; the final byte holds the checksum bits.
  let acc = 0
  let accBits = 0
  let out = 0
  for (let i = 0; i < length; i += 1) {
    acc = (acc << 11) | run[start + i]!
    accBits += 11
    while (accBits >= 8) {
      bytes[out++] = (acc >>> (accBits - 8)) & 0xff
      accBits -= 8
    }
  }
  // The checksum bits are the high bits of the byte after the entropy — a
  // whole byte for 24 words (already emitted), a partial one otherwise.
  const trailing = accBits === 0 ? bytes[entropyBytes]! : (acc << (8 - accBits)) & 0xff
  const mask = (0xff << (8 - checksumBits)) & 0xff
  const expected = sha256(bytes.subarray(0, entropyBytes))[0]! & mask
  return (trailing & mask) === expected
}

/** Whether the whole string, trimmed and space-normalised, is one valid phrase. */
export function isMnemonic(value: string): boolean {
  const words = value.trim().toLowerCase().split(/\s+/)
  if (!(PHRASE_LENGTHS as readonly number[]).includes(words.length)) return false
  const run = words.map((w) => INDEX.get(w))
  if (run.some((i) => i === undefined)) return false
  return checksumHolds(run as number[], 0, words.length)
}
