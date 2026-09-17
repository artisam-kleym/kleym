import { describe, expect, it } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { CODE_LENGTH, hashClaimCode, isClaimCode, normaliseCode, policyDecision } from '@/lib/api/claim-policy'
import { proofHolds } from '@/lib/api/claim-passkey'

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

  it('email: a dead end when the link was never emailed (no code is coming), otherwise the OTP gate', () => {
    expect(policyDecision('email', facts())).toMatchObject({ reason: 'email-only' })
    expect(policyDecision('email', facts({ tokenOk: true }))).toMatchObject({ reason: 'email-only' })
    expect(policyDecision('email', facts({ emailed: true }))).toMatchObject({ reason: 'otp-required' })
    expect(policyDecision('email', facts({ emailed: true, otpOk: true }))).toBeNull()
  })

  it('code: the claim-code token; on an emailed link the OTP comes first and the token stands for both', () => {
    expect(policyDecision('code', facts())).toMatchObject({ reason: 'code-required' })
    expect(policyDecision('code', facts({ tokenOk: true }))).toBeNull()
    // Emailed: the OTP is asked for before the code, so a forwarded email cannot skip the address.
    expect(policyDecision('code', facts({ emailed: true }))).toMatchObject({ reason: 'otp-required' })
    expect(policyDecision('code', facts({ emailed: true, otpOk: true }))).toMatchObject({ reason: 'code-required' })
    // The code route refuses to issue the token until the OTP is satisfied, so this means both were.
    expect(policyDecision('code', facts({ emailed: true, tokenOk: true }))).toBeNull()
  })

  it('passkey: the passkey token; on an emailed link the OTP comes first and the token stands for both', () => {
    expect(policyDecision('passkey', facts())).toMatchObject({ reason: 'passkey-required' })
    expect(policyDecision('passkey', facts({ tokenOk: true }))).toBeNull()
    expect(policyDecision('passkey', facts({ emailed: true }))).toMatchObject({ reason: 'otp-required' })
    expect(policyDecision('passkey', facts({ emailed: true, otpOk: true }))).toMatchObject({ reason: 'passkey-required' })
    expect(policyDecision('passkey', facts({ emailed: true, tokenOk: true }))).toBeNull()
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

/*
 * PASSKEY registration needs the link's holder, not just its public key —
 * which is on the ledger for anyone to read. The proof is the ephemeral
 * keypair's signature over the challenge.
 */
describe('passkey registration proof', () => {
  const holder = Keypair.random()
  const challenge = 'dGhpcyBpcyBhIGNoYWxsZW5nZQ'

  it('holds for the keypair that signed this challenge', () => {
    const proof = holder.sign(Buffer.from(challenge, 'utf8')).toString('base64')
    expect(proofHolds(holder.publicKey(), challenge, proof)).toBe(true)
  })

  it('fails for another key, another challenge, or garbage', () => {
    const proof = holder.sign(Buffer.from(challenge, 'utf8')).toString('base64')
    expect(proofHolds(Keypair.random().publicKey(), challenge, proof)).toBe(false)
    expect(proofHolds(holder.publicKey(), `${challenge}x`, proof)).toBe(false)
    expect(proofHolds(holder.publicKey(), challenge, 'not base64!')).toBe(false)
    expect(proofHolds(holder.publicKey(), challenge, '')).toBe(false)
  })
})
