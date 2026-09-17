/**
 * Stellar value validation at the API boundary. AGENT.md §5.4.
 *
 * The seed rejection here is a defence against a FUTURE refactor, not against
 * today's client. Nothing in Kleym should ever post a seed; this exists so that
 * if something one day does, it fails loudly and is recorded as a security
 * event rather than being quietly persisted.
 */
import { StrKey } from '@stellar/stellar-sdk'
import { z } from 'zod'
import { scanBudget, scanForMnemonic, type ScanBudget } from './mnemonic'

/** Thrown shape for a rejected seed, surfaced as 400 SEED_SUBMITTED. */
export const SEED_SUBMITTED = 'SEED_SUBMITTED' as const

/**
 * True if the value contains a Stellar secret seed ANYWHERE, not merely if it
 * is one. A seed inside a URL, a JSON blob, or one with a stray trailing
 * newline is still a seed reaching the server.
 */
export function containsSecretSeed(value: unknown): boolean {
  /*
   * Fail closed: a value so long the phrase scan gave up is refused like a
   * seed. The callers here hold internal values — audit metadata, webhook
   * payloads, span attributes — where "not logged" is the safe side, and
   * request bodies go through `scanForSecretSeed`, which tells the two apart.
   */
  return secretSeedScan(value, scanBudget()) !== 'clean'
}

type StringScan = 'clean' | 'seed' | 'over-budget'

function secretSeedScan(value: unknown, budget: ScanBudget): StringScan {
  if (typeof value !== 'string') return 'clean'
  const candidates = value.match(/S[A-Z2-7]{55}/g)
  if (candidates) {
    // StrKey confirms the checksum, so a random 56-char string is not a false
    // positive — but the regex prescreen is what catches embedded occurrences.
    if (candidates.some((candidate) => StrKey.isValidEd25519SecretSeed(candidate))) return 'seed'
  }
  /*
   * A BIP39 recovery phrase (#77) is a seed in a different alphabet — and
   * one that reconstructs every campaign derived from it. Everything that
   * refuses a StrKey seed refuses a phrase too, through this one function:
   * request bodies, audit metadata, webhook payloads, the environment scan.
   */
  const phrase = scanForMnemonic(value, budget)
  return phrase === 'phrase' ? 'seed' : phrase
}

/**
 * Deepest structure the scanner will walk before refusing.
 *
 * This scanner is the FIRST thing to touch attacker-shaped JSON — it runs
 * before any schema or size constraint applies — so an unbounded walk is a
 * cheap denial of service: 120 KB of nested objects exhausts the stack.
 * No legitimate Kleym request is anywhere near this deep.
 */
const MAX_SCAN_DEPTH = 32

export type ScanResult =
  | { outcome: 'clean' }
  | { outcome: 'seed'; path: string[] }
  | { outcome: 'too-deep' }
  /** The phrase scan's word budget ran out (#77): implausible, like over-nesting, and not a security event either. */
  | { outcome: 'too-long' }

/**
 * Scans a parsed body for an embedded seed.
 *
 * The three outcomes are deliberately distinct. Reporting over-nesting as a
 * seed would fire a false SEED_SUBMITTED security event on every malformed
 * body — poisoning the one log that is supposed to mean something, and giving
 * anyone a way to spam it. Both are rejected; only one is a security event.
 */
export function scanForSecretSeed(input: unknown, path: string[] = [], depth = 0, budget: ScanBudget = scanBudget()): ScanResult {
  if (depth > MAX_SCAN_DEPTH) return { outcome: 'too-deep' }
  // One budget for the whole body: the phrase scan's cost is capped per request, not per string.
  const scanned = secretSeedScan(input, budget)
  if (scanned === 'seed') return { outcome: 'seed', path }
  if (scanned === 'over-budget') return { outcome: 'too-long' }

  if (Array.isArray(input)) {
    for (const [index, item] of input.entries()) {
      const hit = scanForSecretSeed(item, [...path, String(index)], depth + 1, budget)
      if (hit.outcome !== 'clean') return hit
    }
    return { outcome: 'clean' }
  }

  if (input && typeof input === 'object') {
    for (const [key, value] of Object.entries(input)) {
      const hit = scanForSecretSeed(value, [...path, key], depth + 1, budget)
      if (hit.outcome !== 'clean') return hit
    }
  }
  return { outcome: 'clean' }
}

/** Convenience wrapper: the path to a seed, or null. Over-nesting is not a seed. */
export function findSecretSeed(input: unknown): string[] | null {
  const result = scanForSecretSeed(input)
  return result.outcome === 'seed' ? result.path : null
}

/** A Stellar public key (G...), rejecting anything that is secretly a seed. */
export const stellarPublicKey = z
  .string()
  .refine((v) => !containsSecretSeed(v), { message: SEED_SUBMITTED })
  .refine((v) => StrKey.isValidEd25519PublicKey(v), {
    message: 'must be a Stellar public key (G…)',
  })

/** Free text from a user that must never carry a seed — labels, names, notes. */
export const seedFreeString = z
  .string()
  .refine((v) => !containsSecretSeed(v), { message: SEED_SUBMITTED })
