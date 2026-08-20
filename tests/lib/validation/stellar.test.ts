import { describe, expect, it } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { containsSecretSeed, findSecretSeed, scanForSecretSeed } from '@/lib/validation/stellar'

/*
 * Tests live outside src/ deliberately. The CI guard forbids `.secret()` in
 * application code (AGENT.md §1), and testing seed DETECTION requires a real
 * seed to detect. Rather than weakening the guard with a *.test.ts exclusion —
 * which would leave a file-naming hole in it — src/ stays strictly application
 * code, the same exemption scripts/ already has.
 */

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

describe('findSecretSeed depth limit', () => {
  const nest = (depth: number) => {
    let node: unknown = 'x'
    for (let i = 0; i < depth; i += 1) node = { a: node }
    return node
  }

  // Regression: an unbounded walk exhausted the stack on a 120KB body and the
  // endpoint returned 500. This scanner runs before any schema or size limit,
  // so it is the first thing untrusted input reaches.
  it.each([1_000, 10_000, 50_000])('survives %i levels of nesting', (depth) => {
    expect(() => findSecretSeed(nest(depth))).not.toThrow()
  })

  it('reports over-nesting as too-deep, NOT as a seed', () => {
    // Reporting this as a seed would fire a false SEED_SUBMITTED security
    // event, which anyone could then spam with a nested body.
    expect(scanForSecretSeed(nest(100))).toEqual({ outcome: 'too-deep' })
    expect(findSecretSeed(nest(100))).toBeNull()
  })

  it('still finds seeds within the allowed depth', () => {
    expect(findSecretSeed({ a: { b: { c: SEED } } })).toEqual(['a', 'b', 'c'])
  })
})
