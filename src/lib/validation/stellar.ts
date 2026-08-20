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

/** Recursively scans a parsed body for any embedded seed. */
export function findSecretSeed(input: unknown, path: string[] = []): string[] | null {
  if (containsSecretSeed(input)) return path
  if (Array.isArray(input)) {
    for (const [index, item] of input.entries()) {
      const hit = findSecretSeed(item, [...path, String(index)])
      if (hit) return hit
    }
    return null
  }
  if (input && typeof input === 'object') {
    for (const [key, value] of Object.entries(input)) {
      const hit = findSecretSeed(value, [...path, key])
      if (hit) return hit
    }
  }
  return null
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
