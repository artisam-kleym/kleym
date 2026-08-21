/**
 * Batch lifecycle: plan, prepare, submit, confirm. SPEC.md §3.2, §7.1.
 *
 * The chain is authoritative (AGENT.md §4.2). Nothing here marks a link ACTIVE
 * or writes a `balanceId` from anything the client said — only from a
 * transaction Horizon reports in a closed ledger, whose balances are then read
 * back off the ledger.
 */
import { Account } from '@stellar/stellar-sdk'
import { z } from 'zod'
import { prisma } from '@/lib/db/client'
import { env } from '@/lib/config/env'
import { owned } from './session-guard'
import { isWriteConflict } from './links'
import {
  buildBatchTransaction,
  planBatches,
  totalReserve,
  verifyBatchTransaction,
} from '@/lib/stellar/batch'
import { assetOf, baseReserve, horizon, reservePerLink } from '@/lib/stellar/horizon'

/** Kleym always writes two claimants per link — SPEC.md §3.2. */
const CLAIMANTS_PER_LINK = 2

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

async function loadCampaign(campaignId: string, userId: string) {
  return prisma.campaign.findFirst({
    where: owned(campaignId, userId),
    select: {
      id: true, name: true, status: true, network: true, senderPublicKey: true,
      assetCode: true, assetIssuer: true, amountPerLink: true, linkCount: true,
      expiresAt: true, csvExportedAt: true,
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
        orderBy: { createdAt: 'asc' },
        select: { id: true, ephemeralPublicKey: true },
      })
      if (links.length === 0) return

      for (const plan of planBatches(links, env.MAX_OPS_PER_BATCH)) {
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
  userId: string,
  input: PrepareInput,
): Promise<BatchOutcome<PreparedBatch>> {
  const campaign = await loadCampaign(campaignId, userId)
  if (!campaign) return { kind: 'not-found' }

  const blocked = notReadyToSign(campaign)
  if (blocked) return blocked

  await ensurePlanned(campaign.id)

  const batches = await prisma.batch.findMany({
    where: { campaignId: campaign.id },
    orderBy: { sequence: 'asc' },
    select: { id: true, sequence: true, status: true, links: { select: { id: true, ephemeralPublicKey: true }, orderBy: { createdAt: 'asc' } } },
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
  const perLink = reservePerLink(base, CLAIMANTS_PER_LINK)

  const { xdr } = buildBatchTransaction({
    senderAccount,
    senderPublicKey: campaign.senderPublicKey,
    asset: assetOf(campaign),
    amountPerLink: campaign.amountPerLink.toString(),
    expiresAt: campaign.expiresAt,
    links: target.links,
    networkPassphrase: env.NETWORK_PASSPHRASE,
    baseFee: env.BASE_FEE_STROOPS,
    timeoutSeconds: SIGNING_WINDOW_SECONDS,
  })

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
  userId: string,
  input: SubmitInput,
): Promise<BatchOutcome<SubmittedBatch>> {
  const campaign = await loadCampaign(campaignId, userId)
  if (!campaign) return { kind: 'not-found' }

  const batch = await prisma.batch.findFirst({
    where: { campaignId: campaign.id, sequence: input.sequence },
    select: {
      id: true, sequence: true, status: true, transactionHash: true,
      links: { select: { id: true, ephemeralPublicKey: true }, orderBy: { createdAt: 'asc' } },
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

  const verified = verifyBatchTransaction(input.signedXdr, {
    senderPublicKey: campaign.senderPublicKey,
    asset: assetOf(campaign),
    amountPerLink: campaign.amountPerLink.toString(),
    expiresAt: campaign.expiresAt,
    links: batch.links,
    networkPassphrase: env.NETWORK_PASSPHRASE,
  })
  if (!verified.ok) {
    return conflict(`The signed transaction is not the batch that was prepared (${verified.reason}).`)
  }

  let hash: string
  try {
    const response = await horizon().submitTransaction(verified.transaction)
    hash = response.hash
  } catch (error) {
    const code = horizonResultCode(error)
    await markBatchFailed(batch.id, campaign.id, code)
    return conflict(`Stellar rejected batch ${batch.sequence}: ${code}.`)
  }

  await prisma.batch.update({
    where: { id: batch.id },
    data: { status: 'SUBMITTED', transactionHash: hash, submittedAt: new Date(), errorCode: null },
  })

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
  userId: string,
): Promise<BatchOutcome<{ retried: number[] }>> {
  const campaign = await loadCampaign(campaignId, userId)
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
      data: { status: 'PENDING', errorCode: null, transactionHash: null, submittedAt: null },
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
  await prisma.$transaction([
    ...balanceIds.map(({ linkId, balanceId }) =>
      prisma.claimLink.update({ where: { id: linkId }, data: { balanceId, status: 'ACTIVE' } }),
    ),
    prisma.batch.update({ where: { id: batchId }, data: { status: 'CONFIRMED', confirmedAt: new Date() } }),
  ])
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

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'ACTIVE' } })
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
