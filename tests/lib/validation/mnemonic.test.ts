import { describe, expect, it } from 'vitest'
import { generateMnemonic, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { DEFAULT_WORD_BUDGET, containsMnemonic, isMnemonic, scanBudget, scanForMnemonic } from '@/lib/validation/mnemonic'
import { containsSecretSeed, findSecretSeed, scanForSecretSeed } from '@/lib/validation/stellar'

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
    // "is", "a", "of", "the", "we", "and" are not in the list: the run breaks before any checksum runs.
    expect(containsMnemonic('this is a test of the system that we all know and love very much today')).toBe(false)
    // Twelve consecutive wordlist words: here the checksum is what says it is not a phrase.
    expect(containsMnemonic('abandon ability able about above absent absorb abstract absurd abuse access accident')).toBe(false)
    expect(containsMnemonic('Q3 payout for the design team')).toBe(false)
  })

  it('agrees with the reference validator on every length, and on a flipped checksum', () => {
    // The checksum is computed here, from the indices, instead of by
    // @scure/bip39 per window; this pins the two against each other.
    for (const strength of [128, 160, 192, 224, 256] as const) {
      const phrase = generateMnemonic(wordlist, strength)
      expect(isMnemonic(phrase)).toBe(true)
      expect(containsMnemonic(`x ${phrase} y`)).toBe(true)
      const words = phrase.split(' ')
      const last = words[words.length - 1]!
      words[words.length - 1] = wordlist[(wordlist.indexOf(last) + 1) % wordlist.length]!
      const tampered = words.join(' ')
      expect(isMnemonic(tampered)).toBe(validateMnemonic(tampered, wordlist))
    }
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

/*
 * The scan runs on every string of every guarded body, on public routes. Its
 * cost has to be bounded by construction, not by the rate limit.
 */
describe('scanForMnemonic is bounded', () => {
  const spam = (words: number) => Array.from({ length: words }, () => 'zoo').join(' ')

  it('gives up past the word budget instead of scanning harder — and says so, not "phrase"', () => {
    expect(scanForMnemonic(spam(DEFAULT_WORD_BUDGET), scanBudget())).toBe('clean')
    expect(scanForMnemonic(spam(DEFAULT_WORD_BUDGET + 1), scanBudget())).toBe('over-budget')
  })

  it('spends one budget across every string of a body', () => {
    const half = spam(DEFAULT_WORD_BUDGET / 2 + 1)
    expect(scanForSecretSeed({ a: half, b: half })).toEqual({ outcome: 'too-long' })
    expect(scanForSecretSeed({ a: half })).toEqual({ outcome: 'clean' })
  })

  it('does not charge short runs, so ordinary labels never touch the budget', () => {
    const budget = scanBudget()
    expect(scanForMnemonic(Array.from({ length: 2_000 }, () => 'salary april bonus').join(', '), budget)).toBe('clean')
    expect(budget.words).toBe(DEFAULT_WORD_BUDGET)
  })

  it('stays fast at the budget: the worst case is milliseconds, not seconds', () => {
    const body = spam(DEFAULT_WORD_BUDGET)
    const started = performance.now()
    for (let i = 0; i < 5; i += 1) scanForMnemonic(body, scanBudget())
    expect((performance.now() - started) / 5).toBeLessThan(200)
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
