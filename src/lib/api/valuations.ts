/**
 * Accounting export (#80): journal entries valued at claim time.
 *
 * The gap in every crypto payout tool is the VALUATION DATE. A campaign
 * created on the 1st and claimed on the 14th is an expense on the 14th, at
 * the 14th's rate — and Kleym has the exact ledger timestamp of every claim.
 *
 * The rate is captured ONCE, when the movement settles, and stored beside it
 * (`Valuation`). An export run twice over the same range is byte-identical,
 * including rates; nothing is priced at export time. A movement no source
 * could price is still exported — with `rateSource: unavailable` and an
 * empty fiat column — and the hourly pass retries it against the same
 * historical window, so the line fills in without ever changing once filled.
 *
 * Reclaims are reversals, not omissions: 300 of 1,000 links returned is a
 * real credit against the expense, valued at the reclaim's own time.
 *
 * Decimal throughout; `.toFixed()` on output, never `.toString()` — a line
 * reading `1e-7` is worse than no export (AGENT.md §4.1; `findingsValue` in
 * reconcile.ts is the precedent). Signed like the audit and regulator
 * exports, and organisation-scoped in the query.
 */
import { Asset } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { RATE_SOURCE_UNAVAILABLE, dexRates, type RateSource } from '@/lib/stellar/rates'
import { canonicalJson, signBytes, signingPublicKey } from './audit-chain'

const STROOPS = new Decimal('10000000')

/** Fee in stroops (Horizon's `fee_charged`) → XLM, fixed-point. */
export function feeToXlm(feeCharged: string | number | null | undefined): Decimal {
  if (feeCharged === null || feeCharged === undefined) return new Decimal(0)
  return new Decimal(String(feeCharged)).div(STROOPS)
}

interface Priced {
  rate: string | null
  xlmRate: string | null
  rateSource: string
  rateWindow: string | null
}

/** Both rates a line needs: the asset's, and XLM's for the fee line. Never throws. */
async function price(asset: Asset, currency: string, at: Date, rates: RateSource): Promise<Priced> {
  const [own, xlm] = await Promise.all([
    rates.rateAt(asset, currency, at).catch(() => ({ rate: null, source: RATE_SOURCE_UNAVAILABLE, window: null })),
    asset.isNative()
      ? Promise.resolve(null)
      : rates.rateAt(Asset.native(), currency, at).catch(() => ({ rate: null, source: RATE_SOURCE_UNAVAILABLE, window: null })),
  ])
  return { rate: own.rate, xlmRate: asset.isNative() ? own.rate : (xlm?.rate ?? null), rateSource: own.source, rateWindow: own.window }
}

/**
 * Records what a settled claim was worth at its ledger time. Idempotent on
 * the link; a failure here never fails the claim, which has already
 * happened — the pass fills the row in later.
 */
export async function recordClaimValuation(linkId: string, feeCharged: string | number | null | undefined, rates: RateSource = dexRates): Promise<void> {
  const link = await prisma.claimLink.findUnique({
    where: { id: linkId },
    select: {
      id: true, amount: true, status: true, claimedAt: true, claimTxHash: true,
      campaign: { select: { id: true, assetCode: true, assetIssuer: true, organization: { select: { id: true, reportingCurrency: true } } } },
    },
  })
  if (!link || link.status !== 'CLAIMED' || !link.claimedAt || !link.claimTxHash) return
  const asset = link.campaign.assetIssuer ? new Asset(link.campaign.assetCode, link.campaign.assetIssuer) : Asset.native()
  const currency = link.campaign.organization.reportingCurrency
  const priced = await price(asset, currency, link.claimedAt, rates)
  await prisma.valuation.upsert({
    where: { linkId: link.id },
    create: {
      organizationId: link.campaign.organization.id, campaignId: link.campaign.id, linkId: link.id, kind: 'CLAIM',
      valuedAt: link.claimedAt, assetCode: link.campaign.assetCode, assetIssuer: link.campaign.assetIssuer,
      amount: new Decimal(link.amount.toString()).toFixed(), feeXlm: feeToXlm(feeCharged).toFixed(), currency,
      rate: priced.rate, xlmRate: priced.xlmRate, rateSource: priced.rateSource, rateWindow: priced.rateWindow, transactionHash: link.claimTxHash,
    },
    // A second settle of the same claim (a replayed submit) changes nothing already valued.
    update: {},
  })
}

/** The reclaim's reversal, valued at the reclaim's own time. Idempotent on the batch. */
export async function recordReclaimValuation(reclaimBatchId: string, feeCharged: string | number | null | undefined, rates: RateSource = dexRates): Promise<void> {
  const reclaim = await prisma.reclaimBatch.findUnique({
    where: { id: reclaimBatchId },
    select: {
      id: true, amount: true, submittedAt: true, transactionHash: true,
      campaign: { select: { id: true, assetCode: true, assetIssuer: true, organization: { select: { id: true, reportingCurrency: true } } } },
    },
  })
  if (!reclaim) return
  const asset = reclaim.campaign.assetIssuer ? new Asset(reclaim.campaign.assetCode, reclaim.campaign.assetIssuer) : Asset.native()
  const currency = reclaim.campaign.organization.reportingCurrency
  const priced = await price(asset, currency, reclaim.submittedAt, rates)
  await prisma.valuation.upsert({
    where: { reclaimBatchId: reclaim.id },
    create: {
      organizationId: reclaim.campaign.organization.id, campaignId: reclaim.campaign.id, reclaimBatchId: reclaim.id, kind: 'RECLAIM',
      valuedAt: reclaim.submittedAt, assetCode: reclaim.campaign.assetCode, assetIssuer: reclaim.campaign.assetIssuer,
      amount: new Decimal(reclaim.amount.toString()).toFixed(), feeXlm: feeToXlm(feeCharged).toFixed(), currency,
      rate: priced.rate, xlmRate: priced.xlmRate, rateSource: priced.rateSource, rateWindow: priced.rateWindow, transactionHash: reclaim.transactionHash,
    },
    update: {},
  })
}

export const REVALUE_PASS_LIMIT = 200

/**
 * The hourly pass: rows still unpriced are tried again against the SAME
 * instant. A row, once priced, is never touched — that is what makes two
 * exports identical. Bounded like every other maintenance pass (#43).
 */
export async function revalueUnpriced(rates: RateSource = dexRates, limit = REVALUE_PASS_LIMIT): Promise<{ checked: number; priced: number }> {
  const rows = await prisma.valuation.findMany({
    where: { rate: null },
    orderBy: [{ valuedAt: 'asc' }, { id: 'asc' }],
    take: limit,
    select: { id: true, assetCode: true, assetIssuer: true, currency: true, valuedAt: true },
  })
  let priced = 0
  for (const row of rows) {
    const asset = row.assetIssuer ? new Asset(row.assetCode, row.assetIssuer) : Asset.native()
    const result = await price(asset, row.currency, row.valuedAt, rates)
    if (result.rate === null) continue
    // Conditional on still being unpriced: a concurrent fill wins and this one is a no-op.
    const updated = await prisma.valuation.updateMany({
      where: { id: row.id, rate: null },
      data: { rate: result.rate, xlmRate: result.xlmRate, rateSource: result.rateSource, rateWindow: result.rateWindow },
    })
    priced += updated.count
  }
  if (priced > 0) logger.info({ checked: rows.length, priced }, 'unpriced valuations filled')
  return { checked: rows.length, priced }
}

/* ── The export ─────────────────────────────────────────────────────────── */

export interface AccountingQuery {
  organizationId: string
  campaignId?: string
  from?: Date
  to?: Date
}

const VALUATION_SELECT = {
  id: true, kind: true, valuedAt: true, assetCode: true, assetIssuer: true, amount: true, feeXlm: true, currency: true,
  rate: true, xlmRate: true, rateSource: true, rateWindow: true, transactionHash: true, campaignId: true, linkId: true, reclaimBatchId: true,
  link: { select: { label: true, reference: true, claimedBy: true } },
  reclaimBatch: { select: { balanceCount: true } },
} satisfies Prisma.ValuationSelect

export type ValuationRow = Prisma.ValuationGetPayload<{ select: typeof VALUATION_SELECT }> & { campaignName: string }

/** Every valued movement in scope, in ledger order. Organisation in the query, never after. */
export async function valuationRows(query: AccountingQuery): Promise<ValuationRow[]> {
  const rows = await prisma.valuation.findMany({
    where: {
      organizationId: query.organizationId,
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.from || query.to ? { valuedAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    },
    orderBy: [{ valuedAt: 'asc' }, { id: 'asc' }],
    select: VALUATION_SELECT,
  })
  const campaigns = await prisma.campaign.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.campaignId))] }, organizationId: query.organizationId },
    select: { id: true, name: true },
  })
  const names = new Map(campaigns.map((c) => [c.id, c.name]))
  return rows.map((r) => ({ ...r, campaignName: names.get(r.campaignId) ?? '' }))
}

/** Ledger account names. Fixed strings a bookkeeper maps once to their chart of accounts. */
export const ACCOUNTS = {
  expense: 'Payouts expense',
  asset: (code: string) => `Digital assets (${code})`,
  fees: 'Network fees',
} as const

export const JOURNAL_COLUMNS = [
  'lineId', 'entryId', 'date', 'kind', 'campaignId', 'campaignName', 'linkId', 'reclaimBatchId', 'counterparty', 'transactionHash',
  'debitAccount', 'creditAccount', 'assetCode', 'assetAmount', 'currency', 'rate', 'rateSource', 'rateWindow', 'fiatAmount', 'description',
] as const

export type JournalLine = Record<(typeof JOURNAL_COLUMNS)[number], string | null>

function fixed(value: Decimal | Prisma.Decimal | string | null): string | null {
  return value === null ? null : new Decimal(value.toString()).toFixed()
}

/** Asset amount × rate, in the currency's 2 places, half-even — or null when unpriced. */
export function fiatOf(amount: Decimal | Prisma.Decimal | string, rate: Decimal | Prisma.Decimal | string | null): string | null {
  if (rate === null) return null
  return new Decimal(amount.toString()).times(new Decimal(rate.toString())).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toFixed(2)
}

/**
 * One valued movement → its journal lines: the movement itself (a claim is a
 * debit to expense against the asset; a reclaim the reverse) and, when the
 * sponsor paid a fee, a fee line in XLM. Pure.
 */
export function journalLines(rows: ValuationRow[]): JournalLine[] {
  const out: JournalLine[] = []
  for (const r of rows) {
    const claim = r.kind === 'CLAIM'
    const entryId = claim ? `claim:${r.linkId}` : `reclaim:${r.reclaimBatchId}`
    const date = r.valuedAt.toISOString()
    const base = {
      entryId, date, campaignId: r.campaignId, campaignName: r.campaignName, linkId: r.linkId, reclaimBatchId: r.reclaimBatchId,
      counterparty: r.link?.claimedBy ?? null, transactionHash: r.transactionHash, currency: r.currency,
    }
    out.push({
      ...base,
      lineId: `${entryId}:movement`, kind: claim ? 'claim' : 'reclaim',
      debitAccount: claim ? ACCOUNTS.expense : ACCOUNTS.asset(r.assetCode),
      creditAccount: claim ? ACCOUNTS.asset(r.assetCode) : ACCOUNTS.expense,
      assetCode: r.assetCode, assetAmount: fixed(r.amount), rate: fixed(r.rate), rateSource: r.rateSource, rateWindow: r.rateWindow,
      fiatAmount: fiatOf(r.amount, r.rate),
      description: claim
        ? `Claim of ${fixed(r.amount)} ${r.assetCode}${r.link?.label ? ` — ${r.link.label}` : ''}${r.link?.reference ? ` (${r.link.reference})` : ''}`
        : `Reclaim of ${fixed(r.amount)} ${r.assetCode} — ${r.reclaimBatch?.balanceCount ?? 0} unclaimed link(s) returned (reversal)`,
    })
    const fee = new Decimal(r.feeXlm.toString())
    if (fee.greaterThan(0)) {
      out.push({
        ...base,
        lineId: `${entryId}:fee`, kind: 'fee',
        debitAccount: ACCOUNTS.fees, creditAccount: ACCOUNTS.asset('XLM'),
        assetCode: 'XLM', assetAmount: fee.toFixed(), rate: fixed(r.xlmRate),
        rateSource: r.xlmRate === null ? RATE_SOURCE_UNAVAILABLE : r.rateSource, rateWindow: r.xlmRate === null ? null : r.rateWindow,
        fiatAmount: fiatOf(fee, r.xlmRate),
        description: `Network fee for ${claim ? 'claim' : 'reclaim'} ${r.transactionHash}`,
      })
    }
  }
  return out
}

function csvCell(value: string | null): string {
  const text = value ?? ''
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * The body and a detached signature over exactly those bytes. No generation
 * timestamp INSIDE the body: the same range must give the same bytes every
 * time it is run (acceptance criterion 2). The JSON is the journal-entry
 * shape the mainstream ledgers ingest — entries with balanced debit/credit
 * lines — beside the flat per-line list.
 */
export function buildAccountingExport(
  lines: JournalLine[],
  query: AccountingQuery & { organizationName: string; currency: string },
  format: 'csv' | 'json',
): { body: Buffer; contentType: string; signature: string; publicKey: string; unpriced: number } {
  const unpriced = lines.filter((l) => l.fiatAmount === null).length
  let body: Buffer
  let contentType: string
  if (format === 'json') {
    const entries = new Map<string, { entryId: string; date: string; description: string; transactionHash: string | null; lines: { account: string; debit: string | null; credit: string | null; currency: string; assetCode: string | null; assetAmount: string | null; rate: string | null; rateSource: string | null }[] }>()
    for (const l of lines) {
      const entry = entries.get(l.entryId!) ?? { entryId: l.entryId!, date: l.date!, description: l.description!, transactionHash: l.transactionHash, lines: [] }
      entry.lines.push({ account: l.debitAccount!, debit: l.fiatAmount, credit: null, currency: l.currency!, assetCode: l.assetCode, assetAmount: l.assetAmount, rate: l.rate, rateSource: l.rateSource })
      entry.lines.push({ account: l.creditAccount!, debit: null, credit: l.fiatAmount, currency: l.currency!, assetCode: l.assetCode, assetAmount: l.assetAmount, rate: l.rate, rateSource: l.rateSource })
      entries.set(l.entryId!, entry)
    }
    body = Buffer.from(canonicalJson({
      format: 'kleym-accounting-export', version: 1,
      organization: { id: query.organizationId, name: query.organizationName },
      currency: query.currency, campaignId: query.campaignId ?? null,
      from: query.from?.toISOString() ?? null, to: query.to?.toISOString() ?? null,
      count: lines.length, unpriced,
      lines, entries: [...entries.values()],
    }))
    contentType = 'application/json'
  } else {
    const out = [JOURNAL_COLUMNS.join(',')]
    for (const l of lines) out.push(JOURNAL_COLUMNS.map((c) => csvCell(l[c])).join(','))
    body = Buffer.from(out.join('\n') + '\n')
    contentType = 'text/csv; charset=utf-8'
  }
  return { body, contentType, signature: signBytes(body), publicKey: signingPublicKey(), unpriced }
}
