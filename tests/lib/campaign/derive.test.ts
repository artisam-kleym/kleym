import { describe, expect, it } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { mnemonicToSeedSync } from '@scure/bip39'
import { deriveChild, deriveKeypairs, derivePath, generatePhrase, isValidPhrase, masterNode, phraseFingerprint, randomCampaignIndex } from '@/lib/campaign/derive'
import { deriveEphemeralKeys, publicHalves } from '@/lib/campaign/keygen'
import { buildCsv } from '@/lib/campaign/csv'

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')

/*
 * SLIP-0010 test vector 1 for ed25519 (seed 000102…0f). If this fails, the
 * derivation is wrong and every key a sender would regenerate is wrong with
 * it — fix the implementation, never the vector.
 */
describe('SLIP-0010 ed25519', () => {
  const seed = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex')

  it('derives the master node of test vector 1', () => {
    const m = masterNode(seed)
    expect(hex(m.chainCode)).toBe('90046a93de5380a72b5e45010748567d5ea02bbf6522f979e05c0d8d8ca9fffb')
    expect(hex(m.key)).toBe('2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7')
  })

  it("derives m/0' of test vector 1", () => {
    const child = deriveChild(masterNode(seed), 0)
    expect(hex(child.chainCode)).toBe('8b59aa11380b624e81507a27fedda59fea6d0b779a778918a2fd3590e16e9c69')
    expect(hex(child.key)).toBe('68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3')
  })

  it("derives m/0'/1'/2'/2'/1000000000' of test vector 1", () => {
    let node = masterNode(seed)
    for (const index of [0, 1, 2, 2, 1000000000]) node = deriveChild(node, index)
    expect(hex(node.key)).toBe('8f94d394a8e8fd6b1bc2f3f49f5c47e385281d5c17e65324b0f62483e37e8793')
  })

  it('forces every step hardened — ed25519 has no non-hardened children', () => {
    const m = masterNode(seed)
    expect(hex(deriveChild(m, 0).key)).toBe(hex(deriveChild(m, 0x80000000).key))
  })
})

describe('phrase-derived ephemeral keys (#77)', () => {
  const phrase = generatePhrase()

  it('is deterministic: the same phrase and index give byte-identical keys and CSV', () => {
    const a = deriveEphemeralKeys(phrase, 7, 5, ['a', 'b'])
    const b = deriveEphemeralKeys(phrase, 7, 5, ['a', 'b'])
    expect(a.map((k) => k.secret)).toEqual(b.map((k) => k.secret))
    const rows = (keys: typeof a) => keys.map((key) => ({ key, url: `https://kleym.app/claim#s=${key.secret}` }))
    expect(buildCsv(rows(a))).toBe(buildCsv(rows(b)))
  })

  it('a different campaign index, or a different phrase, gives different keys', () => {
    const base = deriveEphemeralKeys(phrase, 7, 3).map((k) => k.publicKey)
    expect(deriveEphemeralKeys(phrase, 8, 3).map((k) => k.publicKey)).not.toEqual(base)
    expect(deriveEphemeralKeys(generatePhrase(), 7, 3).map((k) => k.publicKey)).not.toEqual(base)
    // Distinct within a campaign too.
    expect(new Set(deriveEphemeralKeys(phrase, 7, 50).map((k) => k.publicKey)).size).toBe(50)
  })

  it('yields real Stellar keypairs whose public half matches the secret', () => {
    for (const key of deriveEphemeralKeys(phrase, 1, 3)) {
      expect(Keypair.fromSecret(key.secret).publicKey()).toBe(key.publicKey)
    }
    expect(publicHalves(deriveEphemeralKeys(phrase, 1, 2)).publicKeys).toHaveLength(2)
  })

  it('follows m/44h/148h/campaign/link', () => {
    const node = derivePath(mnemonicToSeedSync(phrase), 7, 2)
    expect(Keypair.fromRawEd25519Seed(Buffer.from(node.key)).publicKey()).toBe(deriveKeypairs(phrase, 7, 3)[2]!.publicKey())
  })

  it('refuses an invalid phrase and an out-of-range index', () => {
    expect(() => deriveKeypairs('abandon '.repeat(11) + 'zoo', 0, 1)).toThrow(/recovery phrase/)
    expect(() => deriveKeypairs(phrase, 2 ** 31, 1)).toThrow(/31-bit/)
    expect(() => deriveKeypairs(phrase, -1, 1)).toThrow(/31-bit/)
    expect(isValidPhrase(phrase)).toBe(true)
    expect(isValidPhrase(phrase.toUpperCase() + '  ')).toBe(true)
  })

  it('fingerprints a phrase stably, from a public key, at a path no campaign uses', () => {
    expect(phraseFingerprint(phrase)).toBe(phraseFingerprint(phrase.toUpperCase()))
    expect(phraseFingerprint(phrase)).toMatch(/^[0-9a-f]{16}$/)
    expect(phraseFingerprint(phrase)).not.toBe(phraseFingerprint(generatePhrase()))
    // Nothing derived from it reveals a key: it is a hash of a PUBLIC key.
    expect(phraseFingerprint(phrase)).not.toContain(deriveKeypairs(phrase, 2 ** 31 - 1, 1)[0]!.secret())
  })

  it('draws a 31-bit campaign index', () => {
    for (let i = 0; i < 20; i += 1) {
      const index = randomCampaignIndex()
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(2 ** 31)
    }
  })
})
