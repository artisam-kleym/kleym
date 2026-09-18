import { describe, expect, it } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { cadenceSchema, nextRun, parseRecipients, refusedTerms, runTotal, templateSchema, templateTermsSchema } from '@/lib/api/templates'
import { selfApproving, termsHash } from '@/lib/api/approvals'

/*
 * #82. The schedule and the template's terms are pure; the runs — a DRAFT
 * created, the operator told, the pointer moved once — are checked against
 * a database by scripts/verify-templates.ts.
 */
const PUB = Keypair.random().publicKey()
const terms = { network: 'testnet' as const, senderPublicKey: PUB, assetCode: 'XLM', amountPerLink: '25', expiryDays: 30 }

describe('nextRun', () => {
  const after = new Date('2026-09-17T10:30:00Z') // a Thursday

  it('daily: the next run hour after now, today if still ahead, else tomorrow', () => {
    expect(nextRun('daily', 12, after).toISOString()).toBe('2026-09-17T12:00:00.000Z')
    expect(nextRun('daily', 9, after).toISOString()).toBe('2026-09-18T09:00:00.000Z')
  })

  it('weekly: the next matching weekday', () => {
    expect(nextRun('weekly:1', 9, after).toISOString()).toBe('2026-09-21T09:00:00.000Z')
    expect(nextRun('weekly:4', 12, after).toISOString()).toBe('2026-09-17T12:00:00.000Z')
    expect(nextRun('weekly:4', 9, after).toISOString()).toBe('2026-09-24T09:00:00.000Z')
  })

  it('monthly: the next matching day of month, across the month boundary', () => {
    expect(nextRun('monthly:1', 9, after).toISOString()).toBe('2026-10-01T09:00:00.000Z')
    expect(nextRun('monthly:17', 9, after).toISOString()).toBe('2026-10-17T09:00:00.000Z')
  })

  it('never returns the instant it was asked after — a due run is not re-scheduled for itself', () => {
    const due = new Date('2026-09-17T09:00:00Z')
    expect(nextRun('daily', 9, due).getTime()).toBeGreaterThan(due.getTime())
  })

  it('refuses days a month can lack', () => {
    expect(cadenceSchema.safeParse('monthly:31').success).toBe(false)
    expect(cadenceSchema.safeParse('monthly:28').success).toBe(true)
    expect(cadenceSchema.safeParse('weekly:7').success).toBe(false)
    expect(cadenceSchema.safeParse('hourly').success).toBe(false)
  })
})

describe('recipients and totals', () => {
  it('parses the wizard CSV, per-link amounts included, and sums in Decimal', () => {
    const parsed = parseRecipients('label,amount\nalice,10\nbob,\ncarol,0.1\n', 100)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.recipients.labels).toEqual(['alice', 'bob', 'carol'])
    expect(runTotal(terms, parsed.recipients).toFixed()).toBe('35.1')
  })

  it('refuses a key in the list, as the wizard does', () => {
    expect(parseRecipients(`alice\n${Keypair.random().secret()}\n`, 100).ok).toBe(false)
    expect(parseRecipients(`alice\n${PUB}\n`, 100).ok).toBe(false)
    expect(parseRecipients('a\nb\nc\n', 2).ok).toBe(false)
  })

  it('an empty list is allowed on a template and refused at run time by prepareRun', () => {
    const parsed = parseRecipients('', 100)
    expect(parsed.ok && parsed.recipients.labels.length).toBe(0)
  })
})

describe('template terms', () => {
  it('are the campaign body minus name, count and absolute expiry, plus the offset', () => {
    expect(templateTermsSchema.safeParse(terms).success).toBe(true)
    expect(templateTermsSchema.safeParse({ ...terms, name: 'x' }).success).toBe(false)
    expect(templateTermsSchema.safeParse({ ...terms, expiresAt: new Date().toISOString() }).success).toBe(false)
    expect(templateTermsSchema.safeParse({ ...terms, expiryDays: 0 }).success).toBe(false)
    expect(templateSchema.safeParse({ name: 'Monthly', terms, cadence: 'monthly:1', runHour: 9 }).success).toBe(true)
  })

  it('never let a template stand in for an approval: two runs with different totals hash differently, and a run hashes on its own values', () => {
    const march = { assetCode: 'GBP', assetIssuer: PUB, amountPerLink: '100', linkCount: 38, expiresAt: new Date('2026-04-15T00:00:00Z'), variableAmounts: true, totalAmount: '47200' }
    const april = { ...march, linkCount: 41, expiresAt: new Date('2026-05-15T00:00:00Z'), totalAmount: '51300' }
    expect(termsHash(march)).not.toBe(termsHash(april))
    // Same template, same count, same total, different expiry: still its own campaign, still its own hash.
    expect(termsHash(march)).not.toBe(termsHash({ ...march, expiresAt: april.expiresAt }))
  })
})

describe('refusedTerms — the campaign schema judges a template at save time, not at its first run', () => {
  it('passes terms a campaign would accept', () => {
    expect(refusedTerms(terms)).toBeNull()
    expect(refusedTerms({ ...terms, assetCode: 'USDC', assetIssuer: PUB })).toBeNull()
  })

  it('refuses a credit asset with no issuer', () => {
    expect(refusedTerms({ ...terms, assetCode: 'USDC' })).toEqual([expect.objectContaining({ path: 'assetIssuer' })])
  })

  it('refuses an issuer on XLM', () => {
    expect(refusedTerms({ ...terms, assetIssuer: PUB })).toEqual([expect.objectContaining({ path: 'assetIssuer' })])
  })

  it('refuses a receive-as entry that is the campaign asset, and a repeated one', () => {
    expect(refusedTerms({ ...terms, receiveAs: [{ assetCode: 'XLM' }] })).toEqual([expect.objectContaining({ path: 'receiveAs' })])
    expect(refusedTerms({ ...terms, receiveAs: [{ assetCode: 'USDC', assetIssuer: PUB }, { assetCode: 'USDC', assetIssuer: PUB }] })).toEqual([expect.objectContaining({ path: 'receiveAs' })])
  })
})

describe('dual control on a prepared run (#45, #82)', () => {
  it('refuses the author AND the signer as approvers; a third person may approve', () => {
    const campaign = { userId: 'author-a', signedById: 'signer-b' }
    expect(selfApproving(campaign, 'author-a')).toBe(true)
    expect(selfApproving(campaign, 'signer-b')).toBe(true)
    expect(selfApproving(campaign, 'approver-c')).toBe(false)
  })

  it('is unchanged for an ordinary campaign: creator refused, signer unset', () => {
    expect(selfApproving({ userId: 'a', signedById: null }, 'a')).toBe(true)
    expect(selfApproving({ userId: 'a', signedById: null }, 'b')).toBe(false)
  })
})
