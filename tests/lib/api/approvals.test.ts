import { describe, expect, it } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { approvalRequired, campaignValue, changedTerms, termsHash } from '@/lib/api/approvals'

const EXPIRES = new Date('2027-01-01T00:00:00.000Z')
const terms = (over: Partial<{ amountPerLink: string; linkCount: number; variableAmounts: boolean; totalAmount: string | null }> = {}) => ({
  assetCode: 'USDC',
  assetIssuer: Keypair.random().publicKey(),
  amountPerLink: '1.0000000',
  linkCount: 10_000,
  expiresAt: EXPIRES,
  ...over,
})

/*
 * Dual control with per-link amounts (#73, acceptance criterion 6).
 *
 * A threshold compared against `amountPerLink × linkCount` is evaded by
 * 9,999 links of 0.0000001 and one link of 100,000: the product is tiny, the
 * campaign is not. The value has to be the SUM of what the links actually pay.
 */
describe('campaignValue with per-link amounts', () => {
  const policy = { approvalThreshold: '50000', approvalsRequired: 1 }

  it('is the uniform product when no link is registered yet', () => {
    expect(campaignValue(terms()).toFixed()).toBe('10000')
    expect(approvalRequired(terms(), policy)).toBe(false)
  })

  it('plants one enormous link among tiny ones and still requires approval', () => {
    // 9,999 × 0.0000001 + 100,000 — the product of default × count would be 10,000.
    const total = '100000.0009999'
    const planted = terms({ amountPerLink: '0.0000001', totalAmount: total })
    expect(campaignValue(planted).toFixed()).toBe(total)
    expect(approvalRequired(planted, policy)).toBe(true)
    // And the multiplied figure alone would have slipped under the threshold.
    expect(approvalRequired(terms({ amountPerLink: '0.0000001' }), policy)).toBe(false)
  })

  it('never falls below the uniform figure — unregistered links cannot lower the gate', () => {
    // Two links registered so far, each tiny; 9,998 still to come at the default.
    expect(campaignValue(terms({ totalAmount: '0.0000002' })).toFixed()).toBe('10000')
  })

  it('adds in Decimal, not Number', () => {
    expect(campaignValue(terms({ amountPerLink: '0.1', linkCount: 3, totalAmount: '0.3' })).toFixed()).toBe('0.3')
  })
})

describe('termsHash with per-link amounts', () => {
  it('is unchanged for a uniform campaign, so recorded approvals still match', () => {
    const t = terms()
    expect(termsHash({ ...t, variableAmounts: false, totalAmount: null })).toBe(termsHash(t))
    expect(termsHash({ ...t, variableAmounts: false, totalAmount: '10000' })).toBe(termsHash(t))
  })

  it('is keyed on the campaign flag, not on the sum: a uniform campaign registered in batches keeps its hash', () => {
    // Approved after the first 500 of 10,000 links (sum 500 ≠ 10,000), then the rest arrive.
    const t = terms()
    const firstBatch = { ...t, variableAmounts: false, totalAmount: '500' }
    const complete = { ...t, variableAmounts: false, totalAmount: '10000' }
    expect(termsHash(firstBatch)).toBe(termsHash(t))
    expect(termsHash(complete)).toBe(termsHash(firstBatch))
    expect(changedTerms(firstBatch, complete)).toEqual([])
  })

  it('changes when the links pay something other than the uniform total', () => {
    const t = terms()
    expect(termsHash({ ...t, variableAmounts: true, totalAmount: '10001' })).not.toBe(termsHash(t))
  })

  it('names the total as the changed term', () => {
    const before = terms({ variableAmounts: true, totalAmount: '10001' })
    expect(changedTerms(before, { ...before, totalAmount: '20000' })).toEqual(['total amount'])
    expect(changedTerms(before, before)).toEqual([])
  })
})
