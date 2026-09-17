import { describe, expect, it } from 'vitest'
import { Asset, Keypair } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { ACCOUNTS, JOURNAL_COLUMNS, buildAccountingExport, feeToXlm, fiatOf, journalLines, type ValuationRow } from '@/lib/api/valuations'
import { parseAnchors, supportedCurrencies } from '@/lib/stellar/rates'
import { verifyBytes } from '@/lib/api/audit-chain'

/*
 * #80. The journal is a pure function of stored valuations; the rate is
 * captured at settle time and never here, which is what makes two exports
 * byte-identical. The database side — one valuation per settled claim and
 * per reclaim, filled in by the hourly pass — is scripts/verify-valuations.ts.
 */
const ISSUER = Keypair.random().publicKey()
const AT = new Date('2026-09-14T10:15:00.000Z')

const row = (over: Partial<ValuationRow> = {}): ValuationRow => ({
  id: 'v1', kind: 'CLAIM', valuedAt: AT, assetCode: 'USDC', assetIssuer: ISSUER,
  amount: new Decimal('250') as never, feeXlm: new Decimal('0.00001') as never, currency: 'USD',
  rate: new Decimal('1') as never, xlmRate: new Decimal('0.1234567') as never, rateSource: 'identity', rateWindow: null,
  transactionHash: 'ab'.repeat(32), campaignId: 'c1', campaignName: 'March contractors', linkId: 'l1', reclaimBatchId: null,
  link: { label: 'alice', reference: 'INV-7', claimedBy: Keypair.random().publicKey() }, reclaimBatch: null,
  ...over,
})

describe('journalLines', () => {
  it('values a claim at ITS date, debits expense against the asset, and adds a fee line in XLM', () => {
    const lines = journalLines([row()])
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({
      kind: 'claim', date: AT.toISOString(), debitAccount: ACCOUNTS.expense, creditAccount: ACCOUNTS.asset('USDC'),
      assetAmount: '250', rate: '1', fiatAmount: '250.00', rateSource: 'identity', currency: 'USD',
    })
    expect(lines[1]).toMatchObject({ kind: 'fee', debitAccount: ACCOUNTS.fees, creditAccount: ACCOUNTS.asset('XLM'), assetAmount: '0.00001', rate: '0.1234567', fiatAmount: '0.00' })
  })

  it('exports a reclaim as a reversal — the accounts swapped — valued at the reclaim time', () => {
    const later = new Date('2026-10-02T00:00:00.000Z')
    const lines = journalLines([row({ kind: 'RECLAIM', linkId: null, reclaimBatchId: 'r1', link: null, reclaimBatch: { balanceCount: 300 }, valuedAt: later, amount: new Decimal('75000') as never, rate: new Decimal('0.9987') as never, rateSource: 'stellar-dex', rateWindow: '1h' })])
    expect(lines[0]).toMatchObject({ kind: 'reclaim', date: later.toISOString(), debitAccount: ACCOUNTS.asset('USDC'), creditAccount: ACCOUNTS.expense, fiatAmount: '74902.50', rateSource: 'stellar-dex', rateWindow: '1h' })
    expect(lines[0]!.description).toMatch(/300 unclaimed/)
  })

  it('keeps an unpriced line, names the source as unavailable, and leaves the fiat column empty', () => {
    const lines = journalLines([row({ rate: null, xlmRate: null, rateSource: 'unavailable', rateWindow: null })])
    expect(lines[0]).toMatchObject({ rate: null, fiatAmount: null, rateSource: 'unavailable' })
    expect(lines[1]).toMatchObject({ kind: 'fee', fiatAmount: null, rateSource: 'unavailable' })
  })

  it('never renders an exponent, at either extreme the system permits (AGENT.md §4.1)', () => {
    const tiny = journalLines([row({ amount: new Decimal('0.0000001') as never, rate: new Decimal('0.0000001') as never, feeXlm: new Decimal('0.0000001') as never })])
    const huge = journalLines([row({ amount: new Decimal('9999999999999999.9999999') as never, rate: new Decimal('1234567.1234567') as never })])
    for (const l of [...tiny, ...huge]) for (const col of ['assetAmount', 'rate', 'fiatAmount'] as const) expect(l[col] ?? '').not.toMatch(/e[+-]?\d/i)
    expect(tiny[0]!.assetAmount).toBe('0.0000001')
    expect(tiny[0]!.fiatAmount).toBe('0.00')
  })

  it('omits the fee line when the sponsor paid nothing recorded', () => {
    expect(journalLines([row({ feeXlm: new Decimal(0) as never })])).toHaveLength(1)
  })
})

describe('fiatOf / feeToXlm', () => {
  it('multiplies in Decimal and rounds half-even to two places', () => {
    expect(fiatOf('0.1', '3')).toBe('0.30')
    expect(fiatOf('1', '0.125')).toBe('0.12')
    expect(fiatOf('1', '0.135')).toBe('0.14')
    expect(fiatOf('1', null)).toBeNull()
    expect(feeToXlm('100').toFixed()).toBe('0.00001')
    expect(feeToXlm(null).toFixed()).toBe('0')
  })
})

describe('buildAccountingExport', () => {
  const rows = [row(), row({ id: 'v2', linkId: 'l2', amount: new Decimal('0.5') as never, valuedAt: new Date('2026-09-15T00:00:00Z') })]
  const query = { organizationId: 'o1', organizationName: 'Acme', currency: 'USD' }

  it('is byte-identical across runs — no generation time inside the body — and signed', () => {
    const a = buildAccountingExport(journalLines(rows), query, 'json')
    const b = buildAccountingExport(journalLines(rows), query, 'json')
    expect(a.body.equals(b.body)).toBe(true)
    expect(verifyBytes(a.body, a.signature, a.publicKey)).toBe(true)
    const csv1 = buildAccountingExport(journalLines(rows), query, 'csv')
    const csv2 = buildAccountingExport(journalLines(rows), query, 'csv')
    expect(csv1.body.equals(csv2.body)).toBe(true)
    expect(csv1.body.toString('utf8')).not.toMatch(/generatedAt/)
  })

  it('writes balanced journal entries in the JSON and the column header in the CSV', () => {
    const out = buildAccountingExport(journalLines(rows), query, 'json')
    const doc = JSON.parse(out.body.toString('utf8')) as { entries: { lines: { debit: string | null; credit: string | null }[] }[]; count: number; unpriced: number }
    expect(doc.count).toBe(4)
    expect(doc.unpriced).toBe(0)
    for (const entry of doc.entries) {
      const debits = entry.lines.reduce((s, l) => s.plus(l.debit ?? 0), new Decimal(0))
      const credits = entry.lines.reduce((s, l) => s.plus(l.credit ?? 0), new Decimal(0))
      expect(debits.equals(credits)).toBe(true)
    }
    const csv = buildAccountingExport(journalLines(rows), query, 'csv')
    expect(csv.body.toString('utf8').split('\n')[0]).toBe(JOURNAL_COLUMNS.join(','))
  })
})

describe('rate anchors', () => {
  it('parses the currency → anchor asset map and skips what it cannot read', () => {
    const anchors = parseAnchors(`USD=USDC:${ISSUER}, EUR=EURC:${ISSUER},BAD=nope,GBP=GBPX:notakey`)
    expect(anchors.get('USD')?.equals(new Asset('USDC', ISSUER))).toBe(true)
    expect(anchors.get('EUR')?.getCode()).toBe('EURC')
    expect(anchors.has('BAD')).toBe(false)
    expect(anchors.has('GBP')).toBe(false)
    expect(supportedCurrencies()).toContain('USD')
  })
})
