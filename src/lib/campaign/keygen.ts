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
/*
 * `client-only` makes this the COMPILER's rule rather than a grep's.
 *
 * The package resolves to a module that throws under the `react-server`
 * condition, so any server component or route handler that pulls this in fails
 * the build by name. A CI grep can only match the spellings someone thought of
 * — and the first version of that grep matched `@/lib/campaign/keygen` but not
 * `./keygen`, which is the natural way to write it from inside this directory.
 */
import 'client-only'
import { Keypair } from '@stellar/stellar-sdk'
import { deriveKeypairs } from './derive'

/** The sender's own reference data for one recipient (#52). Never key material. */
export interface Attestation {
  reference: string | null
  category: string | null
  note: string | null
}

export interface EphemeralKey {
  publicKey: string
  /** The seed. Exists in memory and in the downloaded CSV, nowhere else. */
  secret: string
  label: string | null
  attestation: Attestation | null
  /** This link's own amount (#73), fixed-point, or null for the campaign default. */
  amount: string | null
}

/**
 * Generates `count` keypairs, with labels aligned by index.
 *
 * `Keypair.random` draws from the platform CSPRNG (`crypto.getRandomValues`).
 * Called in a loop rather than batched so a partially generated set is never
 * held: either the whole campaign's keys exist or none do.
 */
export function generateEphemeralKeys(
  count: number,
  labels: string[] = [],
  attestations: (Attestation | null)[] = [],
  amounts: (string | null)[] = [],
): EphemeralKey[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`link count must be a positive integer, got ${count}`)
  }

  return Array.from({ length: count }, (_, index) => {
    const keypair = Keypair.random()
    return {
      publicKey: keypair.publicKey(),
      secret: keypair.secret(),
      label: labels[index] ?? null,
      attestation: attestations[index] ?? null,
      amount: amounts[index] ?? null,
    }
  })
}

/**
 * Generates `count` keypairs DETERMINISTICALLY from a recovery phrase (#77),
 * at `m/44'/148'/campaignIndex'/link'`. The same phrase and index give the
 * same keys, so the CSV is regenerable from the phrase alone — the sender
 * keeps one phrase instead of one file per campaign. Same shape as
 * `generateEphemeralKeys`; only where the randomness comes from differs.
 */
export function deriveEphemeralKeys(
  phrase: string,
  campaignIndex: number,
  count: number,
  labels: string[] = [],
  attestations: (Attestation | null)[] = [],
  amounts: (string | null)[] = [],
): EphemeralKey[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`link count must be a positive integer, got ${count}`)
  }
  return deriveKeypairs(phrase, campaignIndex, count).map((keypair, index) => ({
    publicKey: keypair.publicKey(),
    secret: keypair.secret(),
    label: labels[index] ?? null,
    attestation: attestations[index] ?? null,
    amount: amounts[index] ?? null,
  }))
}

/** Only the public halves. This is the ONLY shape that may be sent anywhere. */
export function publicHalves(keys: EphemeralKey[]): {
  publicKeys: string[]
  labels: (string | null)[]
  attestations?: (Attestation | null)[]
  amounts?: (string | null)[]
} {
  const attestations = keys.map((key) => key.attestation)
  const amounts = keys.map((key) => key.amount)
  return {
    publicKeys: keys.map((key) => key.publicKey),
    labels: keys.map((key) => key.label),
    // Omitted entirely when nobody set one, so the request is what it always was.
    ...(attestations.some((a) => a !== null) ? { attestations } : {}),
    ...(amounts.some((a) => a !== null) ? { amounts } : {}),
  }
}
