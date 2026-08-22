/**
 * Reconciliation. SPEC.md §3.5, §7.2.
 *
 * "The database is a cache and an index. It is never the authority on whether
 * money moved." This job is what makes that operational — and it is the
 * mechanism that catches every bug in the rest of the system, so it has to be
 * conservative about what it concludes.
 *
 * Every disagreement resolves in the chain's favour, with one exception: a row
 * saying CLAIMED whose balance is STILL on the ledger is not auto-corrected.
 * That direction cannot be explained by a claim Kleym missed — it means Kleym
 * recorded money as moved when it did not, and quietly rewriting the row would
 * erase the evidence of whichever bug produced it.
 *
 * The ledger reads are injectable throughout. That is not a testing
 * convenience: without it every check here passes whenever Horizon is
 * unreachable, which is the false-pass shape #31's review caught.
 */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { horizon, loadClaimableBalance } from '@/lib/stellar/horizon'

export type FindingKind =
  | 'claimed_on_chain'
  | 'reclaimed_on_chain'
  | 'critical_still_on_ledger'
  | 'unresolved'

export interface BalanceDisposal {
  /** Who took it, per the ledger. */
  claimant: string
  transactionHash: string
  /** The sender reclaiming after expiry, rather than the recipient claiming. */
  reclaimed: boolean
}

/**
 * How a balance left the ledger, read from its operation history.
 *
 * SPEC.md §7.2 step 3. Returns null when the history does not answer — Horizon
 * indexes operations slightly behind the ledger, so "no claim op yet" and
 * "never claimed" look identical for a few seconds. Guessing between them is
 * how a live link gets marked CLAIMED.
 */
export type DisposalReader = (balanceId: string) => Promise<BalanceDisposal | null>

export const readDisposal: DisposalReader = async (balanceId) => {
  let operations
  try {
    operations = await horizon().operations().forClaimableBalance(balanceId).limit(200).call()
  } catch (error) {
    /*
     * A 404 here is an ANSWER, not a failure: Horizon returns one for a
     * balance it has no operation history for, which is what an ID that never
     * existed — or one not yet indexed — looks like. Left to throw, it aborted
     * the whole run, so a single unreconcilable row disabled reconciliation
     * for every other campaign. Observed against testnet, not reasoned about.
     */
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 404 || (error as { name?: string })?.name === 'NotFoundError') return null
    throw error
  }

  const claim = operations.records.find((record) => record.type === 'claim_claimable_balance')
  if (!claim) return null

  const claimant = (claim as unknown as { claimant?: string }).claimant
  if (!claimant) return null

  return {
    claimant,
    transactionHash: claim.transaction_hash,
    // Filled in by the caller, which knows the campaign's sender.
    reclaimed: false,
  }
}

export interface ReconcileDeps {
  loadBalance: typeof loadClaimableBalance
  readDisposal: DisposalReader
}

const LIVE: ReconcileDeps = { loadBalance: loadClaimableBalance, readDisposal }

export interface ReconcileReport {
  campaignsChecked: number
  linksChecked: number
  corrected: number
  critical: number
  unresolved: number
}

/** Records a finding, or refreshes the one already open for this link and kind. */
async function record(
  linkId: string,
  campaignId: string,
  kind: FindingKind,
  severity: 'info' | 'warn' | 'error',
  detail: string,
): Promise<void> {
  await prisma.reconciliationFinding.upsert({
    where: { linkId_kind: { linkId, kind } },
    create: { linkId, campaignId, kind, severity, detail },
    // `lastSeenAt` is @updatedAt, so a re-run refreshes rather than duplicates.
    // §10.13 asks that a second run add no noise; an append-only table is noise.
    update: { severity, detail, resolvedAt: null },
  })
}

/** Marks any open finding for this link resolved, so the report stays current. */
async function resolveFindings(linkId: string): Promise<void> {
  await prisma.reconciliationFinding.updateMany({
    where: { linkId, resolvedAt: null },
    data: { resolvedAt: new Date() },
  })
}

/**
 * Reconciles one campaign.
 *
 * Exported so `/admin/reconciliation`'s manual trigger runs THIS code and not a
 * second implementation that drifts from it (acceptance criterion 7).
 */
export async function reconcileCampaign(
  campaignId: string,
  deps: ReconcileDeps = LIVE,
): Promise<ReconcileReport> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, senderPublicKey: true, amountPerLink: true, expiresAt: true },
  })
  if (!campaign) return { campaignsChecked: 0, linksChecked: 0, corrected: 0, critical: 0, unresolved: 0 }

  /*
   * Only links whose batch confirmed. A PENDING link has no balanceId, so
   * there is nothing on the ledger to disagree with — and a FAILED link never
   * had a balance at all.
   */
  const links = await prisma.claimLink.findMany({
    where: { campaignId, balanceId: { not: null } },
    select: { id: true, balanceId: true, status: true, claimedBy: true, claimTxHash: true },
  })

  const report: ReconcileReport = {
    campaignsChecked: 1,
    linksChecked: links.length,
    corrected: 0,
    critical: 0,
    unresolved: 0,
  }

  for (const link of links) {
    /*
     * One link's failure must not abort the run.
     *
     * Reconciliation is the mechanism that catches every other bug in the
     * system, so a single unreadable row taking the whole job down is the
     * worst possible failure mode: the thing that would have told you
     * something is wrong is the thing that stopped running. Each link is
     * isolated, counted as unresolved, and re-read next time.
     */
    try {
      await reconcileLink(link, campaign, campaignId, deps, report)
    } catch (error) {
      report.unresolved += 1
      logger.error(
        { linkId: link.id, campaignId, reason: error instanceof Error ? error.message : 'unknown' },
        'could not reconcile this link; continuing with the rest',
      )
      await record(
        link.id,
        campaignId,
        'unresolved',
        'warn',
        'This link could not be read against the ledger on the last run. Re-checked on the next one.',
      )
    }
  }

  return report
}

interface LinkRow {
  id: string
  balanceId: string | null
  status: string
  claimedBy: string | null
  claimTxHash: string | null
}

/** One link, against the ledger. Extracted so a failure can be isolated. */
async function reconcileLink(
  link: LinkRow,
  campaign: { senderPublicKey: string },
  campaignId: string,
  deps: ReconcileDeps,
  report: ReconcileReport,
): Promise<void> {
  {
    const onLedger = await deps.loadBalance(link.balanceId!)

    if (onLedger) {
      /*
       * THE CRITICAL CASE. The row says the money moved; the ledger says it
       * did not. Not auto-corrected (SPEC.md §7.2 step 5) — this direction
       * cannot be a claim Kleym merely missed, so rewriting the row would
       * destroy the evidence of whatever produced it.
       */
      if (link.status === 'CLAIMED' || link.status === 'RECLAIMED') {
        report.critical += 1
        logger.error(
          { linkId: link.id, campaignId, status: link.status, balanceId: link.balanceId },
          'CRITICAL: link is recorded as settled but its balance is still on the ledger',
        )
        await record(
          link.id,
          campaignId,
          'critical_still_on_ledger',
          'error',
          `Row says ${link.status} but the balance is still on the ledger. Not corrected automatically — investigate before changing it.`,
        )
        return
      }

      // Row and ledger agree that it is unclaimed. Nothing to do.
      await resolveFindings(link.id)
      return
    }

    /* The balance is gone. Already recorded as settled? Then we agree. */
    if (link.status === 'CLAIMED' || link.status === 'RECLAIMED') {
      await resolveFindings(link.id)
      return
    }

    /* Gone from the ledger, still ACTIVE here. Find out who took it. */
    const disposal = await deps.readDisposal(link.balanceId!)

    if (!disposal) {
      /*
       * Horizon indexes operations slightly behind the ledger, so "not yet
       * indexed" and "never claimed" look the same for a few seconds. Re-read
       * next run rather than guess — this is exactly the mid-flight claim
       * acceptance criterion 6 is about.
       */
      report.unresolved += 1
      logger.warn(
        { linkId: link.id, campaignId, balanceId: link.balanceId },
        'balance is gone from the ledger but its claim operation is not indexed yet',
      )
      await record(
        link.id,
        campaignId,
        'unresolved',
        'warn',
        'The balance has left the ledger but its claim operation is not indexed yet. Re-checked on the next run.',
      )
      return
    }

    /*
     * The SENDER taking it back is a reclaim; anyone else is a claim. Compared
     * against the campaign's own sender key, not inferred from timing — a
     * reclaim before expiry would be a bug worth seeing rather than relabelling.
     */
    const reclaimed = disposal.claimant === campaign.senderPublicKey
    const status = reclaimed ? 'RECLAIMED' : 'CLAIMED'

    await prisma.claimLink.update({
      where: { id: link.id },
      data: {
        status,
        claimedBy: disposal.claimant,
        claimTxHash: disposal.transactionHash,
        claimedAt: new Date(),
      },
    })
    report.corrected += 1

    /*
     * Close anything else open for this link BEFORE recording the outcome.
     * A link that was `unresolved` on an earlier run is now settled, and
     * leaving that finding open would keep it on the drift report forever —
     * a report that never empties is one nobody reads.
     */
    await resolveFindings(link.id)

    logger.warn(
      { linkId: link.id, campaignId, status, hash: disposal.transactionHash },
      'drift corrected in the chain’s favour',
    )
    await record(
      link.id,
      campaignId,
      reclaimed ? 'reclaimed_on_chain' : 'claimed_on_chain',
      'warn',
      `The ledger shows this ${reclaimed ? 'reclaimed by the sender' : 'claimed'} in ${disposal.transactionHash}. The row said ACTIVE and has been corrected.`,
    )
  }
}

/** Reconciles every campaign that could still have live balances. */
export async function reconcileAll(deps: ReconcileDeps = LIVE): Promise<ReconcileReport> {
  const campaigns = await prisma.campaign.findMany({
    where: { status: { in: ['ACTIVE', 'PARTIAL', 'EXPIRED'] } },
    select: { id: true },
  })

  const total: ReconcileReport = {
    campaignsChecked: 0,
    linksChecked: 0,
    corrected: 0,
    critical: 0,
    unresolved: 0,
  }

  for (const campaign of campaigns) {
    const report = await reconcileCampaign(campaign.id, deps)
    total.campaignsChecked += report.campaignsChecked
    total.linksChecked += report.linksChecked
    total.corrected += report.corrected
    total.critical += report.critical
    total.unresolved += report.unresolved
  }

  return total
}

export interface ExpiryReport {
  linksExpired: number
  campaignsExpired: number
}

/**
 * Marks past-expiry links and campaigns EXPIRED, which is what makes reclaim
 * available. SPEC.md §7.1.
 *
 * Only ACTIVE links: a CLAIMED one is settled, and a PENDING or FAILED one
 * never had a balance to return. Expiring those would tell the reclaim job
 * (#13) to go looking for money that was never there.
 */
export async function sweepExpired(now: Date = new Date()): Promise<ExpiryReport> {
  const expired = await prisma.campaign.findMany({
    where: { expiresAt: { lte: now }, status: { in: ['ACTIVE', 'PARTIAL', 'CREATING'] } },
    select: { id: true },
  })
  if (expired.length === 0) return { linksExpired: 0, campaignsExpired: 0 }

  const ids = expired.map((campaign) => campaign.id)

  const [links, campaigns] = await prisma.$transaction([
    prisma.claimLink.updateMany({
      where: { campaignId: { in: ids }, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    }),
    prisma.campaign.updateMany({ where: { id: { in: ids } }, data: { status: 'EXPIRED' } }),
  ])

  if (links.count > 0 || campaigns.count > 0) {
    logger.info(
      { linksExpired: links.count, campaignsExpired: campaigns.count },
      'expiry sweep completed',
    )
  }

  return { linksExpired: links.count, campaignsExpired: campaigns.count }
}

/** The open drift report `/admin/reconciliation` renders. */
export async function openFindings() {
  return prisma.reconciliationFinding.findMany({
    where: { resolvedAt: null },
    // Critical first, then oldest — the ones that have been open longest.
    orderBy: [{ severity: 'desc' }, { firstSeenAt: 'asc' }],
    select: {
      id: true, kind: true, severity: true, detail: true,
      firstSeenAt: true, lastSeenAt: true,
      link: { select: { id: true, ephemeralPublicKey: true, status: true, balanceId: true } },
      campaign: { select: { id: true, name: true, amountPerLink: true, assetCode: true } },
    },
  })
}

/** Total value sitting behind unresolved findings, for the admin summary. */
export function findingsValue(
  findings: { campaign: { amountPerLink: unknown } }[],
): string {
  // Decimal, not Number. AGENT.md §4.1 — this is money on a page someone acts on.
  return findings
    .reduce((total, finding) => total.plus(new Decimal(String(finding.campaign.amountPerLink))), new Decimal(0))
    .toFixed()
}
