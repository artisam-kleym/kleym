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
 * No `client-only` / `server-only`: the server refuses a phrase in any body
 * and the page refuses to put one anywhere but React state.
 */
import { validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

/** Valid BIP39 lengths. Windows of any other size are not phrases. */
const PHRASE_LENGTHS = [12, 15, 18, 21, 24] as const
const SHORTEST = 12

const WORDS = new Set(wordlist)

/**
 * True if `value` contains a BIP39 English phrase ANYWHERE — bare, inside a
 * sentence, across line breaks, or with punctuation between words. Matching
 * is case-insensitive because a phrase typed in Title Case is still a phrase.
 */
export function containsMnemonic(value: unknown): boolean {
  if (typeof value !== 'string' || value.length < SHORTEST * 4) return false
  const tokens = value.toLowerCase().split(/[^a-z]+/)

  // Walk runs of consecutive wordlist words; only a run of 12+ can hold a phrase.
  let run: string[] = []
  for (const token of [...tokens, '']) {
    if (token !== '' && WORDS.has(token)) {
      run.push(token)
      continue
    }
    if (run.length >= SHORTEST && runHoldsPhrase(run)) return true
    run = []
  }
  return false
}

function runHoldsPhrase(run: string[]): boolean {
  for (const length of PHRASE_LENGTHS) {
    if (run.length < length) break
    for (let start = 0; start + length <= run.length; start += 1) {
      if (validateMnemonic(run.slice(start, start + length).join(' '), wordlist)) return true
    }
  }
  return false
}

/** Whether the whole string, trimmed and space-normalised, is one valid phrase. */
export function isMnemonic(value: string): boolean {
  const words = value.trim().toLowerCase().split(/\s+/)
  return (PHRASE_LENGTHS as readonly number[]).includes(words.length) && validateMnemonic(words.join(' '), wordlist)
}
