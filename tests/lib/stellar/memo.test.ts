import { describe, expect, it } from 'vitest'
import { checkMemo, memoOf, toMemo } from '@/lib/stellar/memo'

describe('checkMemo', () => {
  it('requires a memo — absent, null or blank are all refused', () => {
    for (const input of [undefined, null, { type: 'id', value: '' }, { type: 'id', value: '   ' }, { type: null, value: '1' }]) {
      const check = checkMemo(input)
      expect(check.ok).toBe(false)
      if (!check.ok) expect(check.detail).toMatch(/memo is required/)
    }
  })

  it('accepts an id up to uint64 and refuses beyond it', () => {
    expect(checkMemo({ type: 'id', value: '12345' })).toEqual({ ok: true, memo: { type: 'id', value: '12345' } })
    expect(checkMemo({ type: 'id', value: '18446744073709551615' }).ok).toBe(true)
    expect(checkMemo({ type: 'id', value: '18446744073709551616' }).ok).toBe(false)
    expect(checkMemo({ type: 'id', value: '12a' }).ok).toBe(false)
    expect(checkMemo({ type: 'id', value: '-1' }).ok).toBe(false)
  })

  // Acceptance criterion 5: over 28 BYTES, named in the message.
  it('bounds text at 28 bytes and says so', () => {
    expect(checkMemo({ type: 'text', value: 'a'.repeat(28) }).ok).toBe(true)
    const over = checkMemo({ type: 'text', value: 'a'.repeat(29) })
    expect(over.ok).toBe(false)
    if (!over.ok) expect(over.detail).toMatch(/28 bytes/)
    // Bytes, not characters: ten 3-byte characters is 30 bytes.
    expect(checkMemo({ type: 'text', value: '€'.repeat(10) }).ok).toBe(false)
    expect(checkMemo({ type: 'text', value: '€'.repeat(9) }).ok).toBe(true)
  })

  it('accepts a 64-hex hash, case-folded, and nothing else', () => {
    const hex = 'AB'.repeat(32)
    expect(checkMemo({ type: 'hash', value: hex })).toEqual({ ok: true, memo: { type: 'hash', value: hex.toLowerCase() } })
    expect(checkMemo({ type: 'hash', value: 'ab'.repeat(31) }).ok).toBe(false)
    expect(checkMemo({ type: 'hash', value: 'zz'.repeat(32) }).ok).toBe(false)
  })

  it('refuses an unknown type', () => {
    expect(checkMemo({ type: 'return', value: 'x' }).ok).toBe(false)
  })
})

describe('toMemo / memoOf round trip', () => {
  it.each([
    { type: 'id' as const, value: '987654321' },
    { type: 'text' as const, value: 'deposit-42' },
    { type: 'hash' as const, value: 'cd'.repeat(32) },
  ])('round-trips a $type memo through the SDK', (memo) => {
    expect(memoOf(toMemo(memo))).toEqual(memo)
  })
})
