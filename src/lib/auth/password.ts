/**
 * Password hashing. AGENT.md §5.1 — argon2id, never bcrypt, never SHA-anything.
 */
import argon2 from 'argon2'

/** OWASP-aligned. Matches prisma/seed.ts; change both together. */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const

/**
 * A hash of a throwaway value, used to spend comparable time when the username
 * does not exist. Without it, "no such user" returns in microseconds while a
 * real user costs ~50ms of argon2 — which is a username oracle.
 */
const dummyHash: Promise<string> = argon2.hash('kleym-timing-equaliser', OPTIONS)
// Settled at module load, so attach a handler now; the real error surfaces at
// the await inside verifyDummyPassword, where the caller can turn it into a 500.
dummyHash.catch(() => undefined)

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS)
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password)
  } catch {
    // A malformed hash must read as "wrong password", never as an error the
    // caller might treat differently.
    return false
  }
}

/**
 * Burn the same work as a real verification. Call on the unknown-user path so
 * response time does not distinguish it (AGENT.md §5.1).
 */
export async function verifyDummyPassword(password: string): Promise<false> {
  // Started at module load, not on first use. Computing it lazily made the
  // FIRST unknown-user request pay a hash AND a verify while every later one
  // paid only the verify — a one-shot asymmetry, but a needless one.
  await verifyPassword(await dummyHash, password)
  return false
}
