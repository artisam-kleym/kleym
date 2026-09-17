/**
 * Deterministic ephemeral keys (#77). BROWSER ONLY. AGENT.md §1.
 *
 * SLIP-0010 ed25519 derivation from a BIP39 recovery phrase, at
 * `m/44'/148'/<campaign>'/<link>'` — 148 is Stellar's coin type. The phrase
 * and every key it yields exist in the sender's tab and nowhere else; what
 * changes is that the sender can regenerate a lost CSV from one phrase they
 * keep, instead of keeping a 10,000-row file safe.
 *
 * The guarantee is untouched. Kleym never sees the phrase, the master key or
 * a child key — the server stores the campaign's derivation INDEX and a
 * fingerprint made from a PUBLIC key, both harmless. What the server does
 * newly have to know is the SHAPE of a phrase, so its leak guards refuse one
 * (lib/validation/mnemonic.ts). Nothing here may be imported by a route
 * handler, a worker or a server component: `client-only` fails the build.
 */
import 'client-only'
import { Keypair } from '@stellar/stellar-sdk'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

const HARDENED = 0x80000000
const PURPOSE = 44
const STELLAR_COIN_TYPE = 148
/** Twelve words. The phrase is meant to be written down. */
const PHRASE_BITS = 128
/** Hardened indexes are 31-bit. */
export const MAX_DERIVATION_INDEX = HARDENED - 1

export interface Node {
  key: Uint8Array
  chainCode: Uint8Array
}

function ser32(index: number): Uint8Array {
  const out = new Uint8Array(4)
  out[0] = (index >>> 24) & 0xff
  out[1] = (index >>> 16) & 0xff
  out[2] = (index >>> 8) & 0xff
  out[3] = index & 0xff
  return out
}

/** SLIP-0010 master node for ed25519: HMAC-SHA512 keyed "ed25519 seed". */
export function masterNode(seed: Uint8Array): Node {
  const I = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed)
  return { key: I.slice(0, 32), chainCode: I.slice(32) }
}

/** One hardened step. ed25519 has no non-hardened children; the index is forced hardened. */
export function deriveChild(parent: Node, index: number): Node {
  const data = new Uint8Array(1 + 32 + 4)
  data[0] = 0
  data.set(parent.key, 1)
  data.set(ser32((index | HARDENED) >>> 0), 33)
  const I = hmac(sha512, parent.chainCode, data)
  return { key: I.slice(0, 32), chainCode: I.slice(32) }
}

/** `m/44'/148'/campaign'/link'`, from the seed. */
export function derivePath(seed: Uint8Array, campaignIndex: number, linkIndex: number): Node {
  let node = masterNode(seed)
  for (const index of [PURPOSE, STELLAR_COIN_TYPE, campaignIndex, linkIndex]) node = deriveChild(node, index)
  return node
}

export function generatePhrase(): string {
  return generateMnemonic(wordlist, PHRASE_BITS)
}

export function isValidPhrase(phrase: string): boolean {
  return validateMnemonic(normalisePhrase(phrase), wordlist)
}

export function normalisePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).join(' ')
}

/** A random 31-bit campaign index, so two campaigns from one phrase never share a path. */
export function randomCampaignIndex(): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0]! & MAX_DERIVATION_INDEX
}

/**
 * Identifies a phrase WITHOUT revealing anything about it: the SHA-256 of the
 * public key at `m/44'/148'/2147483647'` (a campaign index no real campaign
 * will draw), first 16 hex characters. Stored on the campaign so the
 * regenerate flow can tell "wrong phrase" from "wrong campaign" before it
 * derives ten thousand keys.
 */
export function phraseFingerprint(phrase: string): string {
  const seed = mnemonicToSeedSync(normalisePhrase(phrase))
  const node = derivePath(seed, MAX_DERIVATION_INDEX, 0)
  const publicKey = Keypair.fromRawEd25519Seed(Buffer.from(node.key)).publicKey()
  return Buffer.from(sha256(new TextEncoder().encode(publicKey))).toString('hex').slice(0, 16)
}

/** The keypairs for links 0..count-1 of one campaign. Deterministic: the same inputs, the same keys. */
export function deriveKeypairs(phrase: string, campaignIndex: number, count: number): Keypair[] {
  if (!Number.isInteger(campaignIndex) || campaignIndex < 0 || campaignIndex > MAX_DERIVATION_INDEX) {
    throw new Error('campaign index must be a 31-bit unsigned integer')
  }
  if (!isValidPhrase(phrase)) throw new Error('that is not a valid recovery phrase')
  const seed = mnemonicToSeedSync(normalisePhrase(phrase))
  // The first three steps are shared; derive them once, not once per link.
  let account = masterNode(seed)
  for (const index of [PURPOSE, STELLAR_COIN_TYPE, campaignIndex]) account = deriveChild(account, index)
  return Array.from({ length: count }, (_, linkIndex) => Keypair.fromRawEd25519Seed(Buffer.from(deriveChild(account, linkIndex).key)))
}
