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

/** Thrown shape for a rejected seed, surfaced as 400 SEED_SUBMITTED. */
export const SEED_SUBMITTED = 'SEED_SUBMITTED' as const

/**
 * True if the value contains a Stellar secret seed ANYWHERE, not merely if it
 * is one. A seed inside a URL, a JSON blob, or one with a stray trailing
 * newline is still a seed reaching the server.
 */
export function containsSecretSeed(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const candidates = value.match(/S[A-Z2-7]{55}/g)
  if (!candidates) return false
  // StrKey confirms the checksum, so a random 56-char string is not a false
  // positive — but the regex prescreen is what catches embedded occurrences.
  return candidates.some((candidate) => StrKey.isValidEd25519SecretSeed(candidate))
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

/**
 * Scans a parsed body for an embedded seed.
 *
 * The three outcomes are deliberately distinct. Reporting over-nesting as a
 * seed would fire a false SEED_SUBMITTED security event on every malformed
 * body — poisoning the one log that is supposed to mean something, and giving
 * anyone a way to spam it. Both are rejected; only one is a security event.
 */
export function scanForSecretSeed(input: unknown, path: string[] = [], depth = 0): ScanResult {
  if (depth > MAX_SCAN_DEPTH) return { outcome: 'too-deep' }
  if (containsSecretSeed(input)) return { outcome: 'seed', path }

  if (Array.isArray(input)) {
    for (const [index, item] of input.entries()) {
      const hit = scanForSecretSeed(item, [...path, String(index)], depth + 1)
      if (hit.outcome !== 'clean') return hit
    }
    return { outcome: 'clean' }
  }

  if (input && typeof input === 'object') {
    for (const [key, value] of Object.entries(input)) {
      const hit = scanForSecretSeed(value, [...path, key], depth + 1)
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
