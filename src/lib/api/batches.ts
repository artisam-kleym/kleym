/**
 * Batch lifecycle: plan, prepare, submit, confirm. SPEC.md §3.2, §7.1.
 *
 * The chain is authoritative (AGENT.md §4.2). Nothing here marks a link ACTIVE
 * or writes a `balanceId` from anything the client said — only from a
 * transaction Horizon reports in a closed ledger, whose balances are then read
 * back off the ledger.
 */
import { Account, Keypair, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { z } from 'zod'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/client'
import { env } from '@/lib/config/env'
import { owned } from './session-guard'
import { LINK_ORDER } from './link-order'
import { isWriteConflict } from './links'
import { approvalGate, recordSigner } from './approvals'
import { screeningGate } from './screening'
import { recordBatchConfirmLatency } from '@/lib/observability/metrics'
import { emitWebhook } from '@/lib/webhooks/emit'
import {
  buildBatchTransaction,
  planBatches,
  totalReserve,
  verifyBatchTransaction,
} from '@/lib/stellar/batch'
import { assetOf, baseReserve, horizon, reservePerLink, sponsorSpendable } from '@/lib/stellar/horizon'
import { sponsorFor, sponsorSecret } from '@/lib/stellar/sponsors'
import { campaignContextProblem, stellarContextProblem } from '@/lib/stellar/context'

/** Kleym always writes two claimants per link — SPEC.md §3.2. */
export const CLAIMANTS_PER_LINK = 2

/** How long a prepared envelope stays valid for the sender to sign. */
const SIGNING_WINDOW_SECONDS = 600

export const prepareSchema = z
  .object({
    /** Omit to get the next batch that still needs signing. */
    sequence: z.number().int().positive().optional(),
  })
  .strict()

export const submitSchema = z
  .object({
    sequence: z.number().int().positive(),
    signedXdr: z.string().min(1),
  })
  .strict()

export type PrepareInput = z.infer<typeof prepareSchema>
export type SubmitInput = z.infer<typeof submitSchema>

export type BatchOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not-found' }
  | { kind: 'conflict'; detail: string }

const conflict = (detail: string) => ({ kind: 'conflict' as const, detail })

type CampaignRow = NonNullable<Awaited<ReturnType<typeof loadCampaign>>>

/** Rows as the builder and verifier take them: the Decimal column as a fixed-point string. */
function withAmounts<T extends { amount: { toString(): string } }>(links: T[]): (Omit<T, 'amount'> & { amount: string })[] {
  return links.map((link) => ({ ...link, amount: new Decimal(link.amount.toString()).toFixed() }))
}

async function loadCampaign(campaignId: string, organizationId: string) {
  return prisma.campaign.findFirst({
    where: owned(campaignId, organizationId),
    select: {
      id: true, name: true, status: true, network: true, senderPublicKey: true,
      assetCode: true, assetIssuer: true, amountPerLink: true, linkCount: true,
      expiresAt: true, csvExportedAt: true,
      sponsorPublicKey: true,
      fundingMode: true,
    },
  })
}

/**
 * Assigns every registered link to a numbered batch, once.
 *
 * Idempotent: if the campaign already has batches, they are returned as they
 * are. Re-planning would renumber batches that may already be on-chain, and
 * `Batch.sequence` is what the sender's "Batch 3 / 12" refers to.
 *
 * Serializable, for the reason in lib/api/links.ts: two prepare calls arriving
 * together must not both decide the campaign is unplanned and each create a
 * full set of batches.
 *
 * The loser of that race aborts, and that is the transaction WORKING — the
 * campaign is planned, just not by this call. Letting the abort propagate
 * turned an ordinary double-click on "prepare" into a 500, so it is swallowed
 * once the batches are confirmed to exist. Anything else still throws.
 */
export async function ensurePlanned(campaignId: string): Promise<void> {
  try {
    await planOnce(campaignId)
  } catch (error) {
    if (!isWriteConflict(error)) throw error
    const planned = await prisma.batch.count({ where: { campaignId } })
    if (planned === 0) throw error
  }
}

async function planOnce(campaignId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.batch.count({ where: { campaignId } })
      if (existing > 0) return

      const links = await tx.claimLink.findMany({
        where: { campaignId },
        orderBy: LINK_ORDER,
        select: { id: true, ephemeralPublicKey: true },
      })
      if (links.length === 0) return

      const campaign = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { fundingMode: true } })
      const capacity = env.MAX_OPS_PER_BATCH - (campaign.fundingMode === 'SPONSORED' ? 2 : 0)
      if (capacity < 1) throw new Error('The operation limit must allow sponsorship and at least one link.')
      for (const plan of planBatches(links, capacity)) {
        const batch = await tx.batch.create({
          data: { campaignId, sequence: plan.sequence, status: 'PENDING' },
          select: { id: true },
        })
        await tx.claimLink.updateMany({
          where: { id: { in: plan.links.map((l) => l.id) } },
          data: { batchId: batch.id },
        })
      }
    },
    { isolationLevel: 'Serializable' },
  )
}

export interface PreparedBatch {
  sequence: number
  totalBatches: number
  linkCount: number
  xdr: string
  networkPassphrase: string
  /** XLM the sender locks for this batch's links, from the live base reserve. */
  reserve: string
  reservePerLink: string
  baseReserve: string
  expiresAt: string
  feePayer: string
  reservePayer: string
}

/**
 * Builds the unsigned envelope for one batch.
 *
 * The sender's sequence number is read from Horizon on every call rather than
 * remembered: batches are signed and submitted one at a time, and a stale
 * sequence produces an envelope the network rejects after the sender has
 * already approved it in their wallet.
 */
export async function prepareBatch(
  campaignId: string,
  organizationId: string,
  input: PrepareInput,
  /** Who is taking the envelope — recorded as the signer BEFORE the gate, so their own approval cannot let it through (#82). */
  actorId?: string,
): Promise<BatchOutcome<PreparedBatch>> {
  const campaign = await loadCampaign(campaignId, organizationId)
  if (!campaign) return { kind: 'not-found' }

  const networkProblem = await stellarContextProblem(campaign)
  if (networkProblem) return conflict(networkProblem)

  const blocked = notReadyToSign(campaign)
  if (blocked) return blocked
  if (campaign.fundingMode === 'SPONSORED' && campaign.csvExportedAt === null) {
    return conflict('Save the link backup and record its export before funding this campaign.')
  }
  if (campaign.expiresAt.getTime() <= Date.now()) return conflict('This campaign has expired. Create a campaign with a future expiry before funding.')

  if (actorId) await recordSigner(campaign.id, organizationId, actorId)

  // Dual control (#45): no envelope is handed over for an unapproved
  // campaign above the organisation's threshold. Checked against the
  // campaign as it is NOW, so a term edited after approval refuses here.
  const unapproved = await approvalGate(campaign.id)
  if (unapproved) return conflict(unapproved)

  // Compliance screening (#52): the organisation's own callback sees the
  // terms and recipient references before any envelope exists. A hold or a
  // block — or no answer at all — stops here. No URL: nothing happens.
  const held = await screeningGate(campaign.id, { fresh: true })
  if (held) return conflict(held)

  await ensurePlanned(campaign.id)

  const batches = await prisma.batch.findMany({
    where: { campaignId: campaign.id },
    orderBy: { sequence: 'asc' },
    select: { id: true, sequence: true, status: true, preparedXdr: true, links: { select: { id: true, ephemeralPublicKey: true, amount: true }, orderBy: LINK_ORDER } },
  })
  if (batches.length === 0) {
    return conflict('This campaign has no registered links to batch.')
  }

  const target = input.sequence
    ? batches.find((b) => b.sequence === input.sequence)
    : batches.find((b) => b.status === 'PENDING' || b.status === 'FAILED')

  if (!target) {
    return input.sequence
      ? { kind: 'not-found' }
      : conflict('Every batch in this campaign has already been submitted.')
  }
  if (target.status === 'SUBMITTED' || target.status === 'CONFIRMED') {
    return conflict(`Batch ${target.sequence} is already ${target.status.toLowerCase()}.`)
  }
  if (target.links.length === 0) {
    return conflict(`Batch ${target.sequence} has no links.`)
  }

  const senderAccount = await loadSenderAccount(campaign.senderPublicKey)
  if (!senderAccount) {
    return conflict('The sender account does not exist on this network yet. Fund it and try again.')
  }

  const base = await baseReserve()
  const sponsored = campaign.fundingMode === 'SPONSORED'
  const sponsor = sponsored ? sponsorFor(campaign.sponsorPublicKey) : null
  if (sponsored && !sponsor) return conflict('The campaign sponsor is unavailable. Contact the operator.')
  const perLink = sponsored ? base.times(CLAIMANTS_PER_LINK) : reservePerLink(base, CLAIMANTS_PER_LINK)
  if (sponsor) {
    const required = totalReserve(perLink, target.links.length).plus(new Decimal(env.BASE_FEE_STROOPS).times(target.links.length + 2).div(1e7))
    if ((await sponsorSpendable(sponsor.publicKey)).lessThan(required)) {
      return conflict('Kleym does not have enough available XLM to sponsor this batch. No USDC was sent.')
    }
    const asset = assetOf(campaign)
    const account = await horizon().loadAccount(campaign.senderPublicKey)
    const balance = account.balances.find((b) => 'asset_code' in b && b.asset_code === asset.getCode() && b.asset_issuer === asset.getIssuer())
    const available = balance ? new Decimal(balance.balance).minus('selling_liabilities' in balance ? balance.selling_liabilities : '0') : new Decimal(0)
    const principal = target.links.reduce((sum, link) => sum.plus(link.amount.toString()), new Decimal(0))
    if (available.lessThan(principal)) return conflict('The sender does not have enough available USDC for this batch.')
  }
  if (batches.some((b) => b.status === 'SUBMITTED')) {
    return conflict('A previous batch is awaiting ledger confirmation. Check its status before preparing another transaction.')
  }
  const sponsorAccount = sponsor ? await loadSenderAccount(sponsor.publicKey) : null
  if (sponsor && !sponsorAccount) return conflict('The campaign sponsor account is unavailable on this network.')

  const built = buildBatchTransaction({
    senderAccount,
    ...(sponsorAccount ? { sponsorAccount } : {}),
    senderPublicKey: campaign.senderPublicKey,
    asset: assetOf(campaign),
    amountPerLink: campaign.amountPerLink.toString(),
    expiresAt: campaign.expiresAt,
    // Each link's OWN amount (#73). The Decimal column becomes the fixed-point
    // string the operation carries.
    links: withAmounts(target.links),
    networkPassphrase: env.NETWORK_PASSPHRASE,
    baseFee: env.BASE_FEE_STROOPS,
    timeoutSeconds: SIGNING_WINDOW_SECONDS,
  })
  let xdr = built.xdr
  if (target.preparedXdr && target.status === 'PENDING') {
    const existing = TransactionBuilder.fromXDR(target.preparedXdr, env.NETWORK_PASSPHRASE) as Transaction
    if (Number(existing.timeBounds?.maxTime ?? 0) > Math.floor(Date.now() / 1000)) xdr = target.preparedXdr
  }
  // Compare-and-swap: simultaneous preparations return the same persisted body.
  const saved = await prisma.batch.updateMany({
    where: { id: target.id, status: target.status, preparedXdr: target.preparedXdr },
    data: { preparedXdr: xdr, status: 'PENDING', errorCode: null },
  })
  if (saved.count !== 1) return conflict('This batch changed while preparing. Refresh its state before signing.')

  // The campaign is being built the moment the first envelope is handed over.
  if (campaign.status === 'DRAFT') {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'CREATING', reserveEstimate: totalReserve(perLink, campaign.linkCount).toString() },
    })
  }

  return {
    kind: 'ok',
    value: {
      sequence: target.sequence,
      totalBatches: batches.length,
      linkCount: target.links.length,
      xdr,
      networkPassphrase: env.NETWORK_PASSPHRASE,
      reserve: totalReserve(perLink, target.links.length).toString(),
      reservePerLink: perLink.toString(),
      baseReserve: base.toString(),
      expiresAt: campaign.expiresAt.toISOString(),
      feePayer: sponsor?.publicKey ?? campaign.senderPublicKey,
      reservePayer: sponsor?.publicKey ?? campaign.senderPublicKey,
    },
  }
}

export interface SubmittedBatch {
  sequence: number
  status: string
  transactionHash: string
  /** True when this submission returned an already-recorded result. */
  replay: boolean
}

/**
 * Verifies, submits and records one signed batch.
 *
 * Links are NOT marked ACTIVE here. Submission means Horizon accepted the
 * transaction, not that it is in a closed ledger with the balances the
 * campaign expects — that is `batch-confirm`'s job (SPEC.md §7.1).
 */
export async function submitBatch(
  campaignId: string,
  organizationId: string,
  input: SubmitInput,
): Promise<BatchOutcome<SubmittedBatch>> {
  const campaign = await loadCampaign(campaignId, organizationId)
  if (!campaign) return { kind: 'not-found' }

  const networkProblem = campaignContextProblem(campaign)
  if (networkProblem) return conflict(networkProblem)

  // The same gate at the moment money moves. A wallet holding an envelope
  // prepared before an approval was withdrawn does not get to submit it.
  const unapproved = await approvalGate(campaign.id)
  if (unapproved) return conflict(unapproved)

  // Screening again at the moment money moves: a recorded ALLOW for exactly
  // what was screened is honoured; anything else asks the callback again.
  const held = await screeningGate(campaign.id, { fresh: false })
  if (held) return conflict(held)

  const batch = await prisma.batch.findFirst({
    where: { campaignId: campaign.id, sequence: input.sequence },
    select: {
      id: true, sequence: true, status: true, transactionHash: true, preparedXdr: true,
      links: { select: { id: true, ephemeralPublicKey: true, amount: true }, orderBy: LINK_ORDER },
    },
  })
  if (!batch) return { kind: 'not-found' }

  /*
   * Re-submitting an already-submitted batch returns the original result.
   *
   * AGENT.md §4.3: the same signed XDR arriving twice must not create two
   * batches. A double-click is the ordinary case, and the sender has already
   * paid the fee for the first one.
   */
  if (batch.transactionHash && (batch.status === 'SUBMITTED' || batch.status === 'CONFIRMED')) {
    return {
      kind: 'ok',
      value: { sequence: batch.sequence, status: batch.status, transactionHash: batch.transactionHash, replay: true },
    }
  }

  const providerProblem = await stellarContextProblem(campaign)
  if (providerProblem) return conflict(providerProblem)

  const sponsor = campaign.fundingMode === 'SPONSORED' ? sponsorFor(campaign.sponsorPublicKey) : null
  if (campaign.fundingMode === 'SPONSORED' && (!sponsor || !batch.preparedXdr)) {
    return conflict('Prepare this batch with its configured sponsor before signing.')
  }

  const verified = verifyBatchTransaction(input.signedXdr, {
    senderPublicKey: campaign.senderPublicKey,
    ...(sponsor ? { sponsorPublicKey: sponsor.publicKey } : {}),
    ...(batch.preparedXdr ? { preparedHash: TransactionBuilder.fromXDR(batch.preparedXdr, env.NETWORK_PASSPHRASE).hash().toString('hex') } : {}),
    asset: assetOf(campaign),
    amountPerLink: campaign.amountPerLink.toString(),
    expiresAt: campaign.expiresAt,
    // The verifier compares every operation against ITS link's row (#73).
    links: withAmounts(batch.links),
    networkPassphrase: env.NETWORK_PASSPHRASE,
    baseFee: env.BASE_FEE_STROOPS,
  })
  if (!verified.ok) {
    return conflict(`The signed transaction is not the batch that was prepared (${verified.reason}).`)
  }

  // Only the exact server-prepared body receives a sponsor signature.
  if (sponsor) verified.transaction.sign(Keypair.fromSecret(sponsorSecret(sponsor.publicKey)))
  const hash = verified.transaction.hash().toString('hex')
  const recorded = await prisma.batch.updateMany({
    where: { id: batch.id, status: batch.status, transactionHash: batch.transactionHash, preparedXdr: batch.preparedXdr },
    data: { status: 'SUBMITTED', transactionHash: hash, submittedXdr: verified.transaction.toXDR(), submittedAt: new Date(), errorCode: null },
  })
  if (recorded.count !== 1) return conflict('This batch changed during submission. Refresh before retrying.')
  try {
    await horizon().submitTransaction(verified.transaction)
  } catch (error) {
    const code = horizonResultCode(error)
    // A missing response or bad sequence can follow an accepted transaction.
    // Keep its hash and exact envelope; confirmation can safely resend it.
    if (code !== 'submission_failed' && code !== 'tx_bad_seq') {
      await markBatchFailed(batch.id, campaign.id, code)
      return conflict(`Stellar rejected batch ${batch.sequence}: ${code}.`)
    }
  }

  return {
    kind: 'ok',
    value: { sequence: batch.sequence, status: 'SUBMITTED', transactionHash: hash, replay: false },
  }
}

/**
 * Moves failed batches back to PENDING so they can be signed again.
 *
 * A new batch row would renumber the campaign; reusing the row keeps
 * `Batch.sequence` stable, and the links attached to it are exactly the failed
 * ones — SPEC.md §3.2's "a new transaction for only those links" falls out of
 * that rather than needing to be reconstructed.
 */
export async function retryFailedBatches(
  campaignId: string,
  organizationId: string,
): Promise<BatchOutcome<{ retried: number[] }>> {
  const campaign = await loadCampaign(campaignId, organizationId)
  if (!campaign) return { kind: 'not-found' }

  const failed = await prisma.batch.findMany({
    where: { campaignId: campaign.id, status: 'FAILED' },
    orderBy: { sequence: 'asc' },
    select: { id: true, sequence: true },
  })
  if (failed.length === 0) return conflict('This campaign has no failed batches.')

  const ids = failed.map((b) => b.id)
  await prisma.$transaction([
    prisma.batch.updateMany({
      where: { id: { in: ids } },
      data: { status: 'PENDING', errorCode: null, transactionHash: null, submittedAt: null, preparedXdr: null, submittedXdr: null },
    }),
    prisma.claimLink.updateMany({
      where: { batchId: { in: ids } },
      data: { status: 'PENDING' },
    }),
    prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'CREATING' } }),
  ])

  return { kind: 'ok', value: { retried: failed.map((b) => b.sequence) } }
}

/**
 * Records a batch as failed and marks its links FAILED.
 *
 * SPEC.md §3.2: batches 1–6 stay real when batch 7 fails. The links of the
 * failed batch have no on-chain entry, so they must never reach the CSV or be
 * counted as claimable.
 */
export async function markBatchFailed(batchId: string, campaignId: string, errorCode: string): Promise<void> {
  await prisma.$transaction([
    prisma.batch.update({ where: { id: batchId }, data: { status: 'FAILED', errorCode } }),
    prisma.claimLink.updateMany({ where: { batchId }, data: { status: 'FAILED' } }),
  ])
  await settleCampaignStatus(campaignId)
}

/**
 * Marks a batch confirmed and its links ACTIVE, with balance IDs.
 *
 * `balanceIds` must come from the ledger, never from a client. §4.1.3 of the
 * schema notes holds: `ClaimLink.balanceId` is null until the owning batch is
 * CONFIRMED, which is why both are written in one transaction.
 */
export async function confirmBatch(
  batchId: string,
  campaignId: string,
  balanceIds: { linkId: string; balanceId: string }[],
): Promise<void> {
  const confirmedAt = new Date()
  const batch = await prisma.$transaction(async (tx) => {
    for (const { linkId, balanceId } of balanceIds) {
      await tx.claimLink.update({ where: { id: linkId }, data: { balanceId, status: 'ACTIVE' } })
    }
    return tx.batch.update({
      where: { id: batchId },
      data: { status: 'CONFIRMED', confirmedAt },
      select: { submittedAt: true, sequence: true, transactionHash: true, campaign: { select: { network: true, organizationId: true } } },
    })
  })
  // Submit-to-confirm latency (#53): the ledger's time to close, as this system sees it.
  if (batch.submittedAt) recordBatchConfirmLatency((confirmedAt.getTime() - batch.submittedAt.getTime()) / 1000, batch.campaign.network)
  // Outward (#51): the batch is on the ledger; the organisation's systems may want to know.
  await emitWebhook(batch.campaign.organizationId, 'batch.confirmed', {
    campaignId, batchId, sequence: batch.sequence, transactionHash: batch.transactionHash ?? '', links: balanceIds.length,
  })
  await settleCampaignStatus(campaignId)
}

/**
 * Sets the campaign's status from its batches once none are outstanding.
 *
 * ACTIVE requires `csvExportedAt` — the sender holds the only copy of every
 * seed, and a campaign that goes live before they have downloaded it has
 * created funds nobody can claim. The campaign waits in CREATING instead;
 * the export endpoint is what releases it.
 */
export async function settleCampaignStatus(campaignId: string): Promise<void> {
  const [campaign, counts] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true, csvExportedAt: true } }),
    prisma.batch.groupBy({ by: ['status'], where: { campaignId }, _count: true }),
  ])
  if (!campaign) return

  const by = Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<string, number>
  const outstanding = (by.PENDING ?? 0) + (by.SUBMITTED ?? 0)
  if (outstanding > 0) return

  const failed = by.FAILED ?? 0
  const confirmed = by.CONFIRMED ?? 0
  if (confirmed === 0 && failed === 0) return

  if (failed > 0) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PARTIAL' } })
    return
  }
  if (campaign.csvExportedAt === null) return
  // Beside the CSV gate: a campaign whose approval lapsed after its batches
  // confirmed stays CREATING rather than announcing itself live.
  if (await approvalGate(campaignId)) return

  const activated = await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'ACTIVE' }, select: { organizationId: true, linkCount: true } })
  await emitWebhook(activated.organizationId, 'campaign.activated', { campaignId, linkCount: activated.linkCount })
}

function notReadyToSign(campaign: CampaignRow): { kind: 'conflict'; detail: string } | null {
  if (campaign.status === 'DRAFT' || campaign.status === 'CREATING' || campaign.status === 'PARTIAL') return null
  return conflict(`Batches can only be signed while a campaign is DRAFT, CREATING or PARTIAL; this one is ${campaign.status}.`)
}

async function loadSenderAccount(publicKey: string): Promise<Account | null> {
  try {
    const account = await horizon().loadAccount(publicKey)
    return new Account(account.accountId(), account.sequenceNumber())
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 404 || (error as { name?: string })?.name === 'NotFoundError') return null
    throw error
  }
}

/**
 * The transaction result code Horizon reported, or a stand-in.
 *
 * Never the raw error: Horizon's payload carries the full envelope, and this
 * value is stored and shown. AGENT.md §4.4 forbids returning internals to a
 * client.
 */
export function horizonResultCode(error: unknown): string {
  const codes = (error as { response?: { data?: { extras?: { result_codes?: { transaction?: string; operations?: string[] } } } } })
    ?.response?.data?.extras?.result_codes
  if (!codes) return 'submission_failed'
  const operation = codes.operations?.find((code) => code !== 'op_success')
  return operation ?? codes.transaction ?? 'submission_failed'
}
