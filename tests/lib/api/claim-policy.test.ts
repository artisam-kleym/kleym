import { describe, expect, it } from 'vitest'
import { CODE_LENGTH, hashClaimCode, isClaimCode, normaliseCode, policyDecision } from '@/lib/api/claim-policy'

/*
 * #79. The decision is pure given the facts; the routes are checked for
 * WIRING by scripts/verify-claim-policies.ts, against a database.
 */
describe('policyDecision', () => {
  const facts = (over: Partial<{ emailed: boolean; tokenOk: boolean; otpOk: boolean }> = {}) => ({ emailed: false, tokenOk: false, otpOk: false, ...over })

  it('open: whoever holds the link — unless it was emailed, which keeps the OTP gate (#14)', () => {
    expect(policyDecision('open', facts())).toBeNull()
    expect(policyDecision('open', facts({ emailed: true }))).toMatchObject({ reason: 'otp-required' })
    expect(policyDecision('open', facts({ emailed: true, otpOk: true }))).toBeNull()
    // A policy token means nothing to an open link that was emailed.
    expect(policyDecision('open', facts({ emailed: true, tokenOk: true }))).toMatchObject({ reason: 'otp-required' })
  })

  it('email: refused outright when the link was never emailed, otherwise the OTP gate', () => {
    expect(policyDecision('email', facts())).toMatchObject({ reason: 'otp-required' })
    expect(policyDecision('email', facts({ tokenOk: true }))).toMatchObject({ reason: 'otp-required' })
    expect(policyDecision('email', facts({ emailed: true }))).toMatchObject({ reason: 'otp-required' })
    expect(policyDecision('email', facts({ emailed: true, otpOk: true }))).toBeNull()
  })

  it('code: the claim-code token, and only that', () => {
    expect(policyDecision('code', facts())).toMatchObject({ reason: 'code-required' })
    expect(policyDecision('code', facts({ otpOk: true, emailed: true }))).toMatchObject({ reason: 'code-required' })
    expect(policyDecision('code', facts({ tokenOk: true }))).toBeNull()
  })

  it('passkey: the passkey token, and only that', () => {
    expect(policyDecision('passkey', facts())).toMatchObject({ reason: 'passkey-required' })
    expect(policyDecision('passkey', facts({ otpOk: true, emailed: true }))).toMatchObject({ reason: 'passkey-required' })
    expect(policyDecision('passkey', facts({ tokenOk: true }))).toBeNull()
  })
})

describe('claim codes', () => {
  it('normalises what people type — case, separators, O/0 and I/L/1', () => {
    expect(normaliseCode('abcd-efgh-jkmn-p')).toBe('ABCDEFGHJKMNP')
    expect(normaliseCode('0O1IL')).toBe('00111')
    expect(hashClaimCode('abcd efgh jkmn p')).toBe(hashClaimCode('ABCDEFGHJKMNP'))
  })

  it('accepts exactly thirteen Crockford characters', () => {
    expect(isClaimCode('0123456789ABC')).toBe(true)
    expect(isClaimCode('0123456789AB')).toBe(false)
    expect(isClaimCode('0123456789ABU')).toBe(false)
    expect(CODE_LENGTH).toBe(13)
  })

  it('hashes to 64 hex, and different codes to different hashes', () => {
    expect(hashClaimCode('0123456789ABC')).toMatch(/^[0-9a-f]{64}$/)
    expect(hashClaimCode('0123456789ABC')).not.toBe(hashClaimCode('0123456789ABD'))
  })
})
