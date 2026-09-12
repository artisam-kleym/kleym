/**
 * Link keys, generated HERE — on the caller's machine — and never sent.
 *
 * This module is the SDK's equivalent of `import 'client-only'` in Kleym's
 * browser keygen: the only place a seed exists is a `LinkKeys` value, and
 * the only consumers of that type are the CSV writer and the local signer.
 * `publicHalves` is the one function that turns it into something the API
 * client will accept — a `PublicLinks` value is branded, and the client's
 * methods accept nothing else. Every request the client sends is scanned
 * for a seed before it leaves, and throws if one is found.
 */
import { Keypair, StrKey } from '@stellar/stellar-sdk'

export interface Attestation {
  reference?: string | null
  category?: string | null
  note?: string | null
}

export interface LinkKey {
  publicKey: string
  /** The seed. Written to the CSV on the caller's disk; nowhere else. */
  secret: string
  label: string | null
  attestation: Attestation | null
}

/** A set of link keys. Holds seeds: hand it only to `writeSecretsCsv` and `publicHalves`. */
export type LinkKeys = readonly LinkKey[] & { readonly __holdsSeeds: unique symbol }

declare const publicOnly: unique symbol
/** Public keys only. The ONLY shape `KleymClient.registerLinks` accepts. */
export interface PublicLinks {
  readonly [publicOnly]: true
  publicKeys: string[]
  labels: (string | null)[]
  attestations?: (Attestation | null)[]
}

export function generateLinkKeys(count: number, labels: (string | null)[] = [], attestations: (Attestation | null)[] = []): LinkKeys {
  if (!Number.isInteger(count) || count < 1) throw new Error(`link count must be a positive integer, got ${count}`)
  const keys: LinkKey[] = Array.from({ length: count }, (_, i) => {
    const pair = Keypair.random()
    return { publicKey: pair.publicKey(), secret: pair.secret(), label: labels[i] ?? null, attestation: attestations[i] ?? null }
  })
  return keys as unknown as LinkKeys
}

export function publicHalves(keys: LinkKeys): PublicLinks {
  const attestations = keys.map((k) => k.attestation)
  const out = {
    publicKeys: keys.map((k) => k.publicKey),
    labels: keys.map((k) => k.label),
    ...(attestations.some((a) => a !== null) ? { attestations } : {}),
  }
  return out as unknown as PublicLinks
}

/** True if a seed appears anywhere in the string — the same test Kleym's server runs. */
export function containsSecretSeed(value: string): boolean {
  const candidates = value.match(/S[A-Z2-7]{55}/g)
  return !!candidates && candidates.some((c) => StrKey.isValidEd25519SecretSeed(c))
}
