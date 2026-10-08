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
  const clean = phrase.normalize('NFKD').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim().toLowerCase().split(/\s+/).join(' ')
  // Accept the numbered list shown by our own UI, but never reorder words or
  // discard arbitrary characters. Incomplete/misordered numbering stays invalid.
  const pattern = /(?:^|\s)(\d{1,2})[.)]?\s*([a-z]+)(?=\s|$)/g
  const numbered = [...clean.matchAll(pattern)]
  if (numbered.length && clean.replace(pattern, '').trim() === '' && numbered.every((entry, index) => Number(entry[1]) === index + 1)) {
    return numbered.map((entry) => entry[2]).join(' ')
  }
  return clean
}

/** Client-only diagnostics: counts/categories, never the supplied words. */
export function phraseInputStatus(phrase: string): { valid: boolean; wordCount: number; reason: 'count' | 'words' | 'checksum' | null } {
  const normalised = normalisePhrase(phrase)
  const words = normalised ? normalised.split(' ') : []
  const wordCount = words.length
  if (![12, 15, 18, 21, 24].includes(wordCount)) return { valid: false, wordCount, reason: 'count' }
  if (words.some((word) => !wordlist.includes(word))) return { valid: false, wordCount, reason: 'words' }
  const valid = validateMnemonic(normalised, wordlist)
  return { valid, wordCount, reason: valid ? null : 'checksum' }
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

/** Crockford base32 — the alphabet lib/api/claim-policy.ts checks. 13 characters: 65 bits. */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 13
/** The claim code hangs off the link node at this hardened index — a child, never the link key itself. */
const CODE_CHILD = 1

/** One link's derived material: its keypair, and the claim code (#79) the CODE policy would hand out with it. */
export interface DerivedLink {
  keypair: Keypair
  code: string
}

/**
 * The links 0..count-1 of one campaign. Deterministic: the same inputs, the
 * same keys — and the same codes, so a regenerated CSV (#77) carries them.
 *
 * The code is derived from a hardened CHILD of the link node, not from the
 * link key: the URL holds the link's seed and nothing else, and a child
 * needs the chain code too, so holding the link does not give away the code
 * that is supposed to be its second factor. Only the phrase does.
 */
export function deriveLinks(phrase: string, campaignIndex: number, count: number): DerivedLink[] {
  if (!Number.isInteger(campaignIndex) || campaignIndex < 0 || campaignIndex > MAX_DERIVATION_INDEX) {
    throw new Error('campaign index must be a 31-bit unsigned integer')
  }
  if (!isValidPhrase(phrase)) throw new Error('that is not a valid recovery phrase')
  const seed = mnemonicToSeedSync(normalisePhrase(phrase))
  // The first three steps are shared; derive them once, not once per link.
  let account = masterNode(seed)
  for (const index of [PURPOSE, STELLAR_COIN_TYPE, campaignIndex]) account = deriveChild(account, index)
  return Array.from({ length: count }, (_, linkIndex) => {
    const link = deriveChild(account, linkIndex)
    return { keypair: Keypair.fromRawEd25519Seed(Buffer.from(link.key)), code: codeFrom(deriveChild(link, CODE_CHILD).key) }
  })
}

/** The keypairs alone, for callers that want nothing else. */
export function deriveKeypairs(phrase: string, campaignIndex: number, count: number): Keypair[] {
  return deriveLinks(phrase, campaignIndex, count).map((link) => link.keypair)
}

/** Thirteen Crockford characters from 32 uniform bytes: five bits each, the byte's low bits. 32 divides 256, so no bias. */
function codeFrom(bytes: Uint8Array): string {
  return Array.from(bytes.subarray(0, CODE_LENGTH), (byte) => CODE_ALPHABET[byte & 31]!).join('')
}
