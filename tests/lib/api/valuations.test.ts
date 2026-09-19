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
  rate: new Decimal('1') as never, xlmRate: new Decimal('0.1234567') as never, rateSource: 'identity', rateWindow: null, xlmRateSource: 'stellar-dex', xlmRateWindow: '1h',
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
    // The fee line names the XLM lookup's own source and window, not the asset's identity rate.
    expect(lines[1]).toMatchObject({ kind: 'fee', debitAccount: ACCOUNTS.fees, creditAccount: ACCOUNTS.asset('XLM'), assetAmount: '0.00001', rate: '0.1234567', fiatAmount: '0.00', rateSource: 'stellar-dex', rateWindow: '1h' })
  })

  it('exports a reclaim as a reversal — the accounts swapped — valued at the reclaim time', () => {
    const later = new Date('2026-10-02T00:00:00.000Z')
    const lines = journalLines([row({ kind: 'RECLAIM', linkId: null, reclaimBatchId: 'r1', link: null, reclaimBatch: { balanceCount: 300 }, valuedAt: later, amount: new Decimal('75000') as never, rate: new Decimal('0.9987') as never, rateSource: 'stellar-dex', rateWindow: '1h' })])
    expect(lines[0]).toMatchObject({ kind: 'reclaim', date: later.toISOString(), debitAccount: ACCOUNTS.asset('USDC'), creditAccount: ACCOUNTS.expense, fiatAmount: '74902.50', rateSource: 'stellar-dex', rateWindow: '1h' })
    expect(lines[0]!.description).toMatch(/300 unclaimed/)
  })

  it('keeps an unpriced line, names the source as unavailable, and leaves the fiat column empty', () => {
    const lines = journalLines([row({ rate: null, xlmRate: null, rateSource: 'unavailable', rateWindow: null, xlmRateSource: null, xlmRateWindow: null })])
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

/*
 * The pass and the writers against a stand-in client: what they SELECT and
 * what they WRITE is the contract, and a database is not needed to pin it.
 */
import { vi } from 'vitest'
import { PRICE_TIMEOUT_MS, accountingQuerySchema, rangeBound, recordClaimValuation, revalueUnpriced, type ValuationDb } from '@/lib/api/valuations'
import type { RateSource } from '@/lib/stellar/rates'

const rates = (table: Record<string, string | null>, delayMs = 0): RateSource => ({
  rateAt: async (asset) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    const rate = table[asset.isNative() ? 'XLM' : asset.getCode()] ?? null
    return { rate, source: rate === null ? 'unavailable' : 'test', window: rate === null ? null : '1h' }
  },
})

const campaign = { id: 'c1', assetCode: 'USDC', assetIssuer: ISSUER, organization: { id: 'o1', reportingCurrency: 'USD' } }
const claimedLink = { id: 'l1', amount: new Decimal('250'), status: 'CLAIMED', claimedAt: AT, claimTxHash: 'ab'.repeat(32), campaign }

function stub(over: Partial<{ links: unknown[]; batches: unknown[]; reclaimedLinks: unknown[]; rows: unknown[] }> = {}) {
  const writes: Record<string, unknown[]> = { upsert: [], update: [], updateMany: [] }
  const db = {
    claimLink: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => ({ ...claimedLink, id: args.where.id })),
      findMany: vi.fn(async () => over.links ?? []),
    },
    reclaimBatch: { findUnique: vi.fn(async () => null), findMany: vi.fn(async () => over.batches ?? []) },
    // The corrected-reclaim query is raw SQL (its exclusion joins on a hash Prisma cannot express); the stand-in answers ids.
    $queryRaw: vi.fn(async () => over.reclaimedLinks ?? []),
    valuation: {
      findMany: vi.fn(async () => over.rows ?? []),
      upsert: vi.fn(async (args: unknown) => { writes.upsert!.push(args) }),
      update: vi.fn(async (args: unknown) => { writes.update!.push(args) }),
      updateMany: vi.fn(async (args: unknown) => { writes.updateMany!.push(args); return { count: 1 } }),
    },
  } as unknown as ValuationDb
  return { db, writes }
}

describe('revalueUnpriced', () => {
  it('creates the row a failed claim-time write left missing (CLAIMED link, no valuation)', async () => {
    const { db, writes } = stub({ links: [{ id: 'l1' }] })
    const report = await revalueUnpriced(rates({ USDC: '1', XLM: '0.1' }), 50, db)
    expect(report.created).toBe(1)
    expect(writes.upsert).toHaveLength(1)
    expect((writes.upsert![0] as { where: unknown }).where).toEqual({ linkId: 'l1' })
    expect((db.claimLink.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({ where: { status: 'CLAIMED', claimTxHash: { not: null }, valuation: null }, take: 50 })
  })

  it('values a reconciled RECLAIMED link (no batch behind its hash), excluding batch-reclaimed links IN the query so they cannot fill its slots', async () => {
    const { db, writes } = stub({ reclaimedLinks: [{ id: 'lr' }] })
    const report = await revalueUnpriced(rates({ USDC: '1', XLM: '0.1' }), 50, db)
    expect(report.created).toBe(1)
    expect((writes.upsert![0] as { where: unknown }).where).toEqual({ linkId: 'lr' })
    const [sql] = (db.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0]! as [{ sql: string; values: unknown[] }]
    const text = sql.sql.replace(/\s+/g, ' ')
    expect(text).toMatch(/"status" = 'RECLAIMED'/)
    expect(text).toMatch(/NOT EXISTS \(SELECT 1 FROM "Valuation" v WHERE v."linkId" = l."id"\)/)
    expect(text).toMatch(/NOT EXISTS \(SELECT 1 FROM "ReclaimBatch" b WHERE b."transactionHash" = l."claimTxHash"\)/)
    expect(text.trim()).toMatch(/LIMIT \?$/)
    expect(sql.values).toEqual([50])
  })

  it('orders unpriced rows by attempts then time, bumps attempts on a miss, and fills only the missing half', async () => {
    const rows = [
      { id: 'v-asset', assetCode: 'RARE', assetIssuer: ISSUER, currency: 'USD', valuedAt: AT, rate: null, xlmRate: new Decimal('0.1'), feeXlm: new Decimal('0.00001') },
      { id: 'v-fee', assetCode: 'USDC', assetIssuer: ISSUER, currency: 'USD', valuedAt: AT, rate: new Decimal('1'), xlmRate: null, feeXlm: new Decimal('0.00001') },
    ]
    const { db, writes } = stub({ rows })
    const report = await revalueUnpriced(rates({ USDC: '1', XLM: '0.25' }), 50, db)
    const select = (db.valuation.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { where: unknown; orderBy: unknown }
    expect(select.where).toEqual({ OR: [{ rate: null }, { xlmRate: null, feeXlm: { gt: 0 } }] })
    expect(select.orderBy).toEqual([{ attempts: 'asc' }, { valuedAt: 'asc' }, { id: 'asc' }])
    // RARE never prices: attempts bumped, nothing else written for it.
    expect(writes.update).toEqual([{ where: { id: 'v-asset' }, data: { attempts: { increment: 1 } } }])
    // USDC's fee half fills, and only that half.
    expect(writes.updateMany).toHaveLength(1)
    expect(writes.updateMany![0]).toEqual({
      where: { id: 'v-fee', xlmRate: null },
      data: { xlmRate: '0.25', xlmRateSource: 'test', xlmRateWindow: '1h' },
    })
    expect(report.priced).toBe(1)
  })
})

describe('recordClaimValuation', () => {
  it('writes the row even when the price does not come back in time — unpriced, for the pass', async () => {
    vi.useFakeTimers()
    try {
      const { db, writes } = stub()
      const pending = recordClaimValuation('l1', '100', rates({ USDC: '1', XLM: '0.1' }, PRICE_TIMEOUT_MS * 10), db)
      await vi.advanceTimersByTimeAsync(PRICE_TIMEOUT_MS + 1)
      await pending
      expect(writes.upsert).toHaveLength(1)
      const create = (writes.upsert![0] as { create: Record<string, unknown> }).create
      expect(create).toMatchObject({ kind: 'CLAIM', rate: null, rateSource: 'unavailable', xlmRate: null, feeXlm: '0.00001', amount: '250' })
    } finally {
      vi.useRealTimers()
    }
  })

  it("records a reconciled RECLAIMED link as a reversal, with the XLM rate's own source", async () => {
    const { db, writes } = stub()
    ;(db.claimLink.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ...claimedLink, status: 'RECLAIMED' })
    await recordClaimValuation('l1', null, rates({ USDC: '1', XLM: '0.1' }), db)
    const create = (writes.upsert![0] as { create: Record<string, unknown> }).create
    expect(create).toMatchObject({ kind: 'RECLAIM', rate: '1', rateSource: 'test', xlmRate: '0.1', xlmRateSource: 'test', xlmRateWindow: '1h', feeXlm: '0' })
  })
})

describe('accounting range', () => {
  it('reads a bare date as the whole day: from at its first instant, to at its last', () => {
    expect(rangeBound('2026-09-30', 'to')!.toISOString()).toBe('2026-09-30T23:59:59.999Z')
    expect(rangeBound('2026-09-01', 'from')!.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(rangeBound('2026-09-30T12:00:00Z', 'to')!.toISOString()).toBe('2026-09-30T12:00:00.000Z')
    expect(rangeBound('nonsense', 'to')).toBeNull()
    const parsed = accountingQuerySchema.safeParse({ from: '2026-09-01', to: '2026-09-30' })
    expect(parsed.success && parsed.data.to?.toISOString()).toBe('2026-09-30T23:59:59.999Z')
    expect(accountingQuerySchema.safeParse({ to: 'nonsense' }).success).toBe(false)
  })
})
