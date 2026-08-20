import { describe, expect, it } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { containsSecretSeed, findSecretSeed } from './stellar'

const kp = Keypair.random()
const SEED = kp.secret()
const PUB = kp.publicKey()

describe('containsSecretSeed', () => {
  it('detects a bare seed', () => {
    expect(containsSecretSeed(SEED)).toBe(true)
  })

  // The shapes that an anchored check would miss. This exact class of bug has
  // occurred twice in this repo (#20 NEXT_PUBLIC_ guard, #20 schema guard), so
  // these are regression tests, not hypotheticals.
  it.each([
    ['embedded in a URL', `https://example.com/?k=${SEED}`],
    ['trailing whitespace', `${SEED} `],
    ['trailing newline', `${SEED}\n`],
    ['inside a JSON blob', `{"k":"${SEED}"}`],
    ['surrounded by prose', `my key is ${SEED} please keep it`],
  ])('detects a seed %s', (_label, value) => {
    expect(containsSecretSeed(value)).toBe(true)
  })

  it('does not flag a public key', () => {
    expect(containsSecretSeed(PUB)).toBe(false)
  })

  it('does not flag a 56-char string that fails the checksum', () => {
    // Right shape, wrong checksum — StrKey must reject it, or every random
    // base32 blob becomes a false positive and the guard gets disabled.
    expect(containsSecretSeed(`S${'A'.repeat(55)}`)).toBe(false)
  })

  it('ignores non-strings', () => {
    expect(containsSecretSeed(42)).toBe(false)
    expect(containsSecretSeed(null)).toBe(false)
    expect(containsSecretSeed(undefined)).toBe(false)
  })
})

describe('findSecretSeed', () => {
  it('returns the path to a seed in a known field', () => {
    expect(findSecretSeed({ publicKeys: [SEED] })).toEqual(['publicKeys', '0'])
  })

  it('finds a seed in an unknown key, which a strict schema would strip', () => {
    expect(findSecretSeed({ publicKeys: [PUB], backup: SEED })).toEqual(['backup'])
  })

  it('finds a deeply nested seed', () => {
    expect(findSecretSeed({ meta: { a: { b: [SEED] } } })).toEqual(['meta', 'a', 'b', '0'])
  })

  it('returns null for a clean body', () => {
    expect(findSecretSeed({ publicKeys: [PUB], labels: ['alice'] })).toBeNull()
  })
})
