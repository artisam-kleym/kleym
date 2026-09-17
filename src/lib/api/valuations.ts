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
import { z } from 'zod'
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
  xlmRateSource: string | null
  xlmRateWindow: string | null
}

const UNAVAILABLE = { rate: null, source: RATE_SOURCE_UNAVAILABLE, window: null }

/** How long the submit path waits for a price before recording the row unpriced for the pass to fill. */
export const PRICE_TIMEOUT_MS = 3_000

/**
 * Both rates a line needs: the asset's, and XLM's for the fee line — each
 * its own lookup with its own source and window. Never throws, and never
 * waits past `timeoutMs`: a Horizon that is slow answers "unpriced", which
 * the pass retries; a claim that has already landed is not held for it.
 */
async function price(asset: Asset, currency: string, at: Date, rates: RateSource, timeoutMs = PRICE_TIMEOUT_MS): Promise<Priced> {
  const within = <T,>(work: Promise<T>, fallback: T) =>
    Promise.race([work.catch(() => fallback), new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs).unref?.())])
  const [own, xlm] = await Promise.all([
    within(rates.rateAt(asset, currency, at), UNAVAILABLE),
    asset.isNative() ? Promise.resolve(null) : within(rates.rateAt(Asset.native(), currency, at), UNAVAILABLE),
  ])
  const fee = asset.isNative() ? own : xlm
  return {
    rate: own.rate, rateSource: own.source, rateWindow: own.window,
    xlmRate: fee?.rate ?? null, xlmRateSource: fee ? fee.source : null, xlmRateWindow: fee?.window ?? null,
  }
}

/** The subset of the client the valuation writers touch, so a test can stand one in. */
export type ValuationDb = Pick<typeof prisma, 'claimLink' | 'reclaimBatch' | 'valuation'>

/**
 * Records what a settled link was worth at its ledger time — a claim, or a
 * reclaim the ledger reported for one link (reconcile's correction, which
 * has no ReclaimBatch). Idempotent on the link; a failure here never fails
 * the movement, which has already happened — the pass creates the row later.
 * The row is written even when no price came back, so "unpriced" is a row
 * the pass can find, not an absence.
 */
export async function recordClaimValuation(linkId: string, feeCharged: string | number | null | undefined, rates: RateSource = dexRates, db: ValuationDb = prisma): Promise<void> {
  const link = await db.claimLink.findUnique({
    where: { id: linkId },
    select: {
      id: true, amount: true, status: true, claimedAt: true, claimTxHash: true,
      campaign: { select: { id: true, assetCode: true, assetIssuer: true, organization: { select: { id: true, reportingCurrency: true } } } },
    },
  })
  if (!link || (link.status !== 'CLAIMED' && link.status !== 'RECLAIMED') || !link.claimedAt || !link.claimTxHash) return
  const asset = link.campaign.assetIssuer ? new Asset(link.campaign.assetCode, link.campaign.assetIssuer) : Asset.native()
  const currency = link.campaign.organization.reportingCurrency
  const priced = await price(asset, currency, link.claimedAt, rates)
  await db.valuation.upsert({
    where: { linkId: link.id },
    create: {
      organizationId: link.campaign.organization.id, campaignId: link.campaign.id, linkId: link.id, kind: link.status === 'CLAIMED' ? 'CLAIM' : 'RECLAIM',
      valuedAt: link.claimedAt, assetCode: link.campaign.assetCode, assetIssuer: link.campaign.assetIssuer,
      amount: new Decimal(link.amount.toString()).toFixed(), feeXlm: feeToXlm(feeCharged).toFixed(), currency,
      rate: priced.rate, xlmRate: priced.xlmRate, rateSource: priced.rateSource, rateWindow: priced.rateWindow,
      xlmRateSource: priced.xlmRateSource, xlmRateWindow: priced.xlmRateWindow, transactionHash: link.claimTxHash,
    },
    // A second settle of the same claim (a replayed submit) changes nothing already valued.
    update: {},
  })
}

/** The reclaim's reversal, valued at the reclaim's own time. Idempotent on the batch. */
export async function recordReclaimValuation(reclaimBatchId: string, feeCharged: string | number | null | undefined, rates: RateSource = dexRates, db: ValuationDb = prisma): Promise<void> {
  const reclaim = await db.reclaimBatch.findUnique({
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
  await db.valuation.upsert({
    where: { reclaimBatchId: reclaim.id },
    create: {
      organizationId: reclaim.campaign.organization.id, campaignId: reclaim.campaign.id, reclaimBatchId: reclaim.id, kind: 'RECLAIM',
      valuedAt: reclaim.submittedAt, assetCode: reclaim.campaign.assetCode, assetIssuer: reclaim.campaign.assetIssuer,
      amount: new Decimal(reclaim.amount.toString()).toFixed(), feeXlm: feeToXlm(feeCharged).toFixed(), currency,
      rate: priced.rate, xlmRate: priced.xlmRate, rateSource: priced.rateSource, rateWindow: priced.rateWindow,
      xlmRateSource: priced.xlmRateSource, xlmRateWindow: priced.xlmRateWindow, transactionHash: reclaim.transactionHash,
    },
    update: {},
  })
}

export const REVALUE_PASS_LIMIT = 200

export interface RevalueReport {
  /** Settled movements with no row at all — the claim-time write failed — given one. */
  created: number
  checked: number
  priced: number
}

/**
 * The hourly pass, in two halves, each bounded like every other maintenance
 * pass (#43):
 *
 * 1. Movements with NO row: a CLAIMED link (claim hash set) without a
 *    valuation, a ReclaimBatch without one, and a RECLAIMED link whose hash
 *    is not a batch's (reconcile's correction). The claim-time write is
 *    best-effort, so the pass is what makes "every settled movement has a
 *    line" true.
 * 2. Rows still unpriced — the asset rate, or the fee's XLM rate where a fee
 *    was paid — tried again against the SAME instant. Each failed try bumps
 *    `attempts`, and the pass orders on it, so a row no window will ever
 *    price cannot hold every slot against newer rows. Only the missing half
 *    is filled; a rate once set is never touched, which is what makes two
 *    exports identical.
 */
export async function revalueUnpriced(rates: RateSource = dexRates, limit = REVALUE_PASS_LIMIT, db: ValuationDb = prisma): Promise<RevalueReport> {
  const report: RevalueReport = { created: 0, checked: 0, priced: 0 }

  const claims = await db.claimLink.findMany({
    where: { status: 'CLAIMED', claimTxHash: { not: null }, valuation: null },
    orderBy: [{ claimedAt: 'asc' }, { id: 'asc' }],
    take: limit,
    select: { id: true },
  })
  for (const link of claims) {
    await recordClaimValuation(link.id, null, rates, db)
    report.created += 1
  }
  const batches = await db.reclaimBatch.findMany({
    where: { valuation: null },
    orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    take: limit,
    select: { id: true },
  })
  for (const batch of batches) {
    await recordReclaimValuation(batch.id, null, rates, db)
    report.created += 1
  }
  // A reclaim the ledger reported for one link, with no batch behind it: reconcile's correction.
  const corrected = await db.claimLink.findMany({
    where: { status: 'RECLAIMED', claimTxHash: { not: null }, valuation: null },
    orderBy: [{ claimedAt: 'asc' }, { id: 'asc' }],
    take: limit,
    select: { id: true, claimTxHash: true, campaign: { select: { reclaims: { select: { transactionHash: true } } } } },
  })
  for (const link of corrected) {
    // A batch reclaim's links carry the batch's hash and are valued by the batch row, not per link.
    if (link.campaign.reclaims.some((r) => r.transactionHash === link.claimTxHash)) continue
    await recordClaimValuation(link.id, null, rates, db)
    report.created += 1
  }

  const rows = await db.valuation.findMany({
    where: { OR: [{ rate: null }, { xlmRate: null, feeXlm: { gt: 0 } }] },
    orderBy: [{ attempts: 'asc' }, { valuedAt: 'asc' }, { id: 'asc' }],
    take: limit,
    select: { id: true, assetCode: true, assetIssuer: true, currency: true, valuedAt: true, rate: true, xlmRate: true, feeXlm: true },
  })
  report.checked = rows.length
  for (const row of rows) {
    const asset = row.assetIssuer ? new Asset(row.assetCode, row.assetIssuer) : Asset.native()
    const result = await price(asset, row.currency, row.valuedAt, rates)
    const fillRate = row.rate === null && result.rate !== null
    const fillXlm = row.xlmRate === null && new Decimal(row.feeXlm.toString()).greaterThan(0) && result.xlmRate !== null
    if (!fillRate && !fillXlm) {
      await db.valuation.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } })
      continue
    }
    // Only the half that was missing, and only if it is still missing: a concurrent fill wins.
    const updated = await db.valuation.updateMany({
      where: { id: row.id, ...(fillRate ? { rate: null } : {}), ...(fillXlm && !fillRate ? { xlmRate: null } : {}) },
      data: {
        ...(fillRate ? { rate: result.rate, rateSource: result.rateSource, rateWindow: result.rateWindow } : {}),
        ...(fillXlm ? { xlmRate: result.xlmRate, xlmRateSource: result.xlmRateSource, xlmRateWindow: result.xlmRateWindow } : {}),
      },
    })
    report.priced += updated.count
  }
  if (report.created > 0 || report.priced > 0) logger.info(report, 'valuation pass: rows created and priced')
  return report
}

/* ── The export ─────────────────────────────────────────────────────────── */

/**
 * A range bound. A bare date (`2026-09-30`) means that whole day: `from`
 * is its first instant, `to` its LAST — otherwise `to=2026-09-30` would
 * coerce to midnight and drop the day it names. An instant is taken as is.
 */
export function rangeBound(raw: string, edge: 'from' | 'to'): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T${edge === 'to' ? '23:59:59.999' : '00:00:00.000'}Z`)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

const bound = (edge: 'from' | 'to') =>
  z.string().optional().transform((raw, ctx) => {
    if (raw === undefined) return undefined
    const date = rangeBound(raw, edge)
    if (!date) ctx.addIssue({ code: 'custom', message: 'a date (YYYY-MM-DD) or an ISO instant' })
    return date ?? undefined
  })

export const accountingQuerySchema = z.object({
  from: bound('from'),
  to: bound('to'),
  campaignId: z.string().min(1).max(64).optional(),
  format: z.enum(['csv', 'json']).default('csv'),
})

export interface AccountingQuery {
  organizationId: string
  campaignId?: string
  from?: Date
  to?: Date
}

const VALUATION_SELECT = {
  id: true, kind: true, valuedAt: true, assetCode: true, assetIssuer: true, amount: true, feeXlm: true, currency: true,
  rate: true, xlmRate: true, rateSource: true, rateWindow: true, xlmRateSource: true, xlmRateWindow: true, transactionHash: true, campaignId: true, linkId: true, reclaimBatchId: true,
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
        // The XLM rate is its own lookup, with its own source and window (never the asset's).
        rateSource: r.xlmRateSource ?? RATE_SOURCE_UNAVAILABLE, rateWindow: r.xlmRateWindow,
        fiatAmount: fiatOf(fee, r.xlmRate),
        // TX2's fee only: TX1 (materialise) is submitted separately and its result is not kept on the link.
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
