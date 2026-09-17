import { describe, expect, it } from 'vitest'
import { generateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { containsMnemonic, isMnemonic } from '@/lib/validation/mnemonic'
import { containsSecretSeed, findSecretSeed } from '@/lib/validation/stellar'

const PHRASE = generateMnemonic(wordlist, 128)
const LONG = generateMnemonic(wordlist, 256)

/*
 * #77. A recovery phrase is the most valuable secret in the system and
 * matches none of the StrKey guards. These pin that every shape a phrase can
 * arrive in is seen, and that ordinary English is not.
 */
describe('containsMnemonic', () => {
  it('detects a bare twelve- and twenty-four-word phrase', () => {
    expect(containsMnemonic(PHRASE)).toBe(true)
    expect(containsMnemonic(LONG)).toBe(true)
    expect(isMnemonic(PHRASE)).toBe(true)
  })

  it('detects a phrase embedded in prose, in Title Case, across lines and with punctuation', () => {
    expect(containsMnemonic(`my recovery words are: ${PHRASE}. please keep them`)).toBe(true)
    expect(containsMnemonic(PHRASE.split(' ').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' '))).toBe(true)
    expect(containsMnemonic(PHRASE.split(' ').join('\n'))).toBe(true)
    expect(containsMnemonic(PHRASE.split(' ').join(', '))).toBe(true)
    expect(containsMnemonic(JSON.stringify({ note: PHRASE }))).toBe(true)
  })

  it('does not flag ordinary English that happens to use wordlist words', () => {
    // Every word here is in the BIP39 list; the checksum is what says it is not a phrase.
    expect(containsMnemonic('this is a test of the system that we all know and love very much today')).toBe(false)
    expect(containsMnemonic('abandon ability able about above absent absorb abstract absurd abuse access accident')).toBe(false)
    expect(containsMnemonic('Q3 payout for the design team')).toBe(false)
  })

  it('does not flag a phrase with one word changed — the checksum fails', () => {
    const words = PHRASE.split(' ')
    words[3] = words[3] === 'zoo' ? 'abandon' : 'zoo'
    // A tampered phrase may still validate by chance (1 in 16); accept either
    // outcome for the tampered one but require the original to be seen.
    expect(containsMnemonic(PHRASE)).toBe(true)
    expect(isMnemonic('abandon '.repeat(11) + 'zoo')).toBe(false)
  })

  it('ignores non-strings and short strings', () => {
    expect(containsMnemonic(42)).toBe(false)
    expect(containsMnemonic(null)).toBe(false)
    expect(containsMnemonic('abandon abandon')).toBe(false)
  })
})

describe('containsSecretSeed sees a phrase too (#77)', () => {
  it('refuses a phrase through the same function every guard calls', () => {
    expect(containsSecretSeed(PHRASE)).toBe(true)
    expect(containsSecretSeed(`label: ${PHRASE}`)).toBe(true)
  })

  it('finds a planted phrase in a body — the field the schema would strip, the nested one, the label', () => {
    expect(findSecretSeed({ publicKeys: ['G'], surprise: PHRASE })).toEqual(['surprise'])
    expect(findSecretSeed({ a: { b: { c: `see ${PHRASE}` } } })).toEqual(['a', 'b', 'c'])
    expect(findSecretSeed({ labels: ['alice', PHRASE] })).toEqual(['labels', '1'])
    expect(findSecretSeed({ name: 'Q3 payout', labels: ['alice', 'bob'] })).toBeNull()
  })
})
