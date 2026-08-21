/**
 * Ephemeral keypair generation. BROWSER ONLY. AGENT.md §1.
 *
 * Every secret this product ever creates is created here, in the sender's tab,
 * and leaves it by exactly one route: the CSV they download. Nothing in this
 * module may be imported by a route handler, a worker, or a server component —
 * a server-rendered call would put seeds in the RSC payload, which is a
 * response body.
 *
 * The generated seeds live in React state for the duration of one wizard run
 * and are dropped on navigation. That is not a limitation to work around: a
 * sender who loses the CSV loses those funds until expiry (SPEC.md §1.2), and
 * the wizard's job is to make that impossible to stumble into, not to keep a
 * copy somewhere convenient.
 */
import { Keypair } from '@stellar/stellar-sdk'

export interface EphemeralKey {
  publicKey: string
  /** The seed. Exists in memory and in the downloaded CSV, nowhere else. */
  secret: string
  label: string | null
}

/**
 * Generates `count` keypairs, with labels aligned by index.
 *
 * `Keypair.random` draws from the platform CSPRNG (`crypto.getRandomValues`).
 * Called in a loop rather than batched so a partially generated set is never
 * held: either the whole campaign's keys exist or none do.
 */
export function generateEphemeralKeys(count: number, labels: string[] = []): EphemeralKey[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`link count must be a positive integer, got ${count}`)
  }

  return Array.from({ length: count }, (_, index) => {
    const keypair = Keypair.random()
    return {
      publicKey: keypair.publicKey(),
      secret: keypair.secret(),
      label: labels[index] ?? null,
    }
  })
}

/** Only the public halves. This is the ONLY shape that may be sent anywhere. */
export function publicHalves(keys: EphemeralKey[]): { publicKeys: string[]; labels: (string | null)[] } {
  return {
    publicKeys: keys.map((key) => key.publicKey),
    labels: keys.map((key) => key.label),
  }
}
