/**
 * Reclaim: returning unclaimed funds to the sender after expiry.
 * SPEC.md §3.4, §10.5.
 *
 * The rule that shapes this whole module is SPEC.md §3.4: query the chain for
 * which balances still exist, and reconcile the database from that result —
 * never the other way round. A `ClaimClaimableBalance` operation for a balance
 * a recipient already took fails with `op_does_not_exist`, and because Stellar
 * transactions are atomic that ONE stale operation voids the other 89 refunds
 * in the batch. So a database row is never authorisation to build an op.
 */
import { emitWebhook } from '@/lib/webhooks/emit'
import { Account, type Transaction } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { z } from 'zod'
import { prisma } from '@/lib/db/client'
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'
import { owned } from './session-guard'
import { LINK_ORDER } from './link-order'
import { chunkLinks } from '@/lib/stellar/batch'
import {
  buildReclaimTransaction,
  claimedBalanceIds,
  verifyReclaimTransaction,
} from '@/lib/stellar/reclaim'
import { horizon } from '@/lib/stellar/horizon'
import { stellarContextProblem } from '@/lib/stellar/context'
import { horizonResultCode } from './batches'
import { recordReclaimValuation } from './valuations'
import { feeChargedOf } from '@/lib/stellar/fees'

/** How long a prepared envelope stays valid for the sender to sign. */
const SIGNING_WINDOW_SECONDS = 600

/**
 * No body. `prepare` always builds the FIRST batch of whatever is still on
 * the ledger, and the client loops until it answers nothing-left.
 *
 * It used to accept a `sequence`, documented as "omit for the first batch",
 * which implied a client could walk 1, 2, 3. It could not: the batch list is
 * recomputed from a live ledger query on every call, so once batch 1 lands
 * the old batch 2 has become batch 1, and asking for `sequence: 2` skips it.
 * A documented parameter whose documented use strands funds is worse than no
 * parameter — the review on #34 found it, so it is gone.
 */
export const reclaimPrepareSchema = z.object({}).strict()

export const reclaimSubmitSchema = z.object({ signedXdr: z.string().min(1) }).strict()

export type ReclaimSubmitInput = z.infer<typeof reclaimSubmitSchema>

/**
 * The conflicts a client has to tell apart. `nothing-left` ends the reclaim
 * loop; the other two are things the sender needs to be shown.
 */
export type ReclaimConflictReason = 'nothing-left' | 'not-expired' | 'no-sender-account'

export type ReclaimOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not-found' }
  | { kind: 'conflict'; detail: string; reason?: ReclaimConflictReason }

const conflict = (detail: string, reason?: ReclaimConflictReason) => ({
  kind: 'conflict' as const,
  detail,
  ...(reason ? { reason } : {}),
})

/**
 * A duplicate-key error, in either shape Prisma 7 reports it.
 *
 * It surfaces as `P2002` through the client and as a bare
 * `UniqueConstraintViolation` from the driver adapter, with no code on the
 * outer error. Matching only the code let the second shape through — the same
 * trap `isWriteConflict` in lib/api/links.ts already documents.
 */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if ((error as { code?: string }).code === 'P2002') return true
  const cause = (error as { cause?: { kind?: string } }).cause
  if (cause?.kind === 'UniqueConstraintViolation') return true
  return /UniqueConstraintViolation|duplicate key value/.test(
    error instanceof Error ? error.message : '',
  )
}

/**
 * Balances the sender can still claim, from the ledger, as id → amount.
 *
 * One query stream rather than one lookup per link: a 200-link campaign would
 * otherwise be 200 round trips on every prepare AND every submit.
 */
export type SenderBalanceReader = (senderPublicKey: string) => Promise<Map<string, string>>

export const readSenderBalances: SenderBalanceReader = async (senderPublicKey) => {
  const found = new Map<string, string>()
  let page = await horizon().claimableBalances().claimant(senderPublicKey).limit(200).call()

  while (page.records.length > 0) {
    for (const record of page.records) found.set(record.id, record.amount)
    page = await page.next()
  }
  return found
}

export interface ReclaimDeps {
  readBalances: SenderBalanceReader
  /** Injected so a prepared envelope can be built without a live account. */
  loadAccount: (publicKey: string) => Promise<Account | null>
  /**
   * Injected so the recording path can be exercised without the network.
   *
   * Without this, every check of what reclaim WRITES would depend on a
   * testnet submission succeeding — and would quietly pass for the wrong
   * reason whenever Horizon was unreachable, which is exactly the false pass
   * this codebase has already been bitten by once.
   */
  /** Submits and reports the fee charged in stroops (null when unknown), for the accounting fee line (#80). */
  submit: (transaction: Transaction) => Promise<{ feeCharged: string | number | null } | void>
}

const liveAccount = async (publicKey: string): Promise<Account | null> => {
  try {
    const account = await horizon().loadAccount(publicKey)
    // A bare Account, not the AccountResponse — the builder needs the sequence
    // number and nothing else, and mirrors batches.ts.
    return new Account(account.accountId(), account.sequenceNumber())
  } catch {
    return null
  }
}

const liveSubmit = async (transaction: Transaction): Promise<{ feeCharged: string | number | null }> => {
  const response = await horizon().submitTransaction(transaction)
  return { feeCharged: feeChargedOf(response.result_xdr) }
}

const LIVE: ReclaimDeps = {
  readBalances: readSenderBalances,
  loadAccount: liveAccount,
  submit: liveSubmit,
}

async function loadCampaign(campaignId: string, organizationId: string) {
  return prisma.campaign.findFirst({
    where: owned(campaignId, organizationId),
    select: {
      id: true, name: true, status: true, senderPublicKey: true, network: true, sponsorPublicKey: true,
      assetCode: true, assetIssuer: true, amountPerLink: true, expiresAt: true,
    },
  })
}

/**
 * Which of this campaign's balances the ledger still holds, in batch order.
 *
 * The intersection is what makes the database non-authoritative: the ledger
 * query returns every balance the sender can claim across ALL their campaigns,
 * and the campaign's rows say which of those are this campaign's business.
 * Neither side alone is allowed to decide.
 */
async function reclaimable(
  campaign: { id: string; senderPublicKey: string },
  deps: ReclaimDeps,
): Promise<{ balanceId: string; linkId: string; amount: string }[]> {
  const links = await prisma.claimLink.findMany({
    where: { campaignId: campaign.id, balanceId: { not: null } },
    orderBy: LINK_ORDER,
    select: { id: true, balanceId: true },
  })

  const onLedger = await deps.readBalances(campaign.senderPublicKey)

  return links
    .filter((link) => onLedger.has(link.balanceId!))
    .map((link) => ({ linkId: link.id, balanceId: link.balanceId!, amount: onLedger.get(link.balanceId!)! }))
}

export interface PreparedReclaim {
  /** Batches still to go, counting this one, as of this ledger read. */
  batchesRemaining: number
  balanceCount: number
  /** Exact total this batch returns, summed from the ledger's own amounts. */
  amount: string
  xdr: string
  networkPassphrase: string
}

/**
 * Builds the unsigned envelope for one reclaim batch.
 *
 * Refuses before `expiresAt` rather than building a transaction the network
 * will reject: the sender's claimant predicate is
 * `NOT(BEFORE_ABSOLUTE_TIME(expiresAt))`, so an early reclaim fails on
 * submission — after the sender has already approved it in their wallet.
 */
export async function prepareReclaim(
  campaignId: string,
  organizationId: string,
  deps: ReclaimDeps = LIVE,
): Promise<ReclaimOutcome<PreparedReclaim>> {
  const campaign = await loadCampaign(campaignId, organizationId)
  if (!campaign) return { kind: 'not-found' }

  const networkProblem = await stellarContextProblem(campaign)
  if (networkProblem) return conflict(networkProblem)

  if (Date.now() < campaign.expiresAt.getTime()) {
    return conflict(
      `This campaign does not expire until ${campaign.expiresAt.toISOString()}. Unclaimed funds can only be returned after that.`,
      'not-expired',
    )
  }

  const available = await reclaimable(campaign, deps)
  if (available.length === 0) {
    return conflict(
      'There is nothing left to reclaim — the ledger holds no unclaimed balances for this campaign.',
      'nothing-left',
    )
  }

  // Always the first batch of what is left: see reclaimPrepareSchema.
  const batches = chunkLinks(available, env.MAX_OPS_PER_BATCH)
  const target = batches[0]!

  const senderAccount = await deps.loadAccount(campaign.senderPublicKey)
  if (!senderAccount) {
    return conflict(
      'The sender account does not exist on this network. Fund it and try again.',
      'no-sender-account',
    )
  }

  const { xdr } = buildReclaimTransaction({
    senderAccount,
    senderPublicKey: campaign.senderPublicKey,
    balanceIds: target.map((b) => b.balanceId),
    networkPassphrase: env.NETWORK_PASSPHRASE,
    baseFee: env.BASE_FEE_STROOPS,
    timeoutSeconds: SIGNING_WINDOW_SECONDS,
  })

  return {
    kind: 'ok',
    value: {
      batchesRemaining: batches.length,
      balanceCount: target.length,
      // toFixed, not toString: one stroop is "0.0000001", never "1e-7". AGENT.md §4.1.
      amount: target.reduce((sum, b) => sum.plus(b.amount), new Decimal(0)).toFixed(),
      xdr,
      networkPassphrase: env.NETWORK_PASSPHRASE,
    },
  }
}

export interface SubmittedReclaim {
  transactionHash: string
  balanceCount: number
  amount: string
  /** Balances still awaiting reclaim after this one lands. */
  remaining: number
  campaignStatus: string
  /** True when this submission returned an already-recorded result. */
  replay: boolean
}

/**
 * Verifies, submits and records one signed reclaim.
 *
 * The envelope is re-checked against a FRESH ledger query, not against
 * whatever `prepare` decided: a recipient claiming their link while the sender
 * was in their wallet is the ordinary case, not an exotic one, and submitting
 * an envelope containing that balance would void every other refund in it.
 */
export async function submitReclaim(
  campaignId: string,
  organizationId: string,
  input: ReclaimSubmitInput,
  deps: ReclaimDeps = LIVE,
): Promise<ReclaimOutcome<SubmittedReclaim>> {
  const campaign = await loadCampaign(campaignId, organizationId)
  if (!campaign) return { kind: 'not-found' }

  const networkProblem = await stellarContextProblem(campaign)
  if (networkProblem) return conflict(networkProblem)

  if (Date.now() < campaign.expiresAt.getTime()) {
    return conflict('This campaign has not expired yet.', 'not-expired')
  }

  const claimed = claimedBalanceIds(input.signedXdr, env.NETWORK_PASSPHRASE)
  if (!claimed || claimed.length === 0) {
    return conflict('That is not a reclaim transaction for this campaign.')
  }

  /*
   * Ownership first, liveness second — and they are different rejections.
   *
   * A balance belonging to another campaign is a signed envelope trying to
   * move funds this request has no authority over. A balance that merely went
   * missing since prepare is the expected race, and the sender needs to be
   * told to prepare again rather than that something is wrong.
   */
  const links = await prisma.claimLink.findMany({
    where: { campaignId: campaign.id, balanceId: { in: claimed } },
    select: { id: true, balanceId: true },
  })
  const mine = new Map(links.map((l) => [l.balanceId!, l.id]))
  if (mine.size !== claimed.length) {
    return conflict('That transaction includes balances that do not belong to this campaign.')
  }

  const onLedger = await deps.readBalances(campaign.senderPublicKey)
  const gone = claimed.filter((id) => !onLedger.has(id))
  if (gone.length > 0) {
    return conflict(
      `${gone.length} of these ${gone.length === 1 ? 'balances was' : 'balances were'} claimed while you were signing. Prepare the reclaim again to return the rest.`,
    )
  }

  const verified = verifyReclaimTransaction(input.signedXdr, {
    senderPublicKey: campaign.senderPublicKey,
    balanceIds: claimed,
    networkPassphrase: env.NETWORK_PASSPHRASE,
    baseFee: env.BASE_FEE_STROOPS,
  })
  if (!verified.ok) {
    return conflict(`The signed transaction is not the reclaim that was prepared (${verified.reason}).`)
  }

  /*
   * Replay is checked on the transaction's own hash, not just the
   * Idempotency-Key header.
   *
   * The header protects against a retried HTTP request; this protects against
   * the same signed envelope arriving under a fresh key, which would otherwise
   * be submitted twice and double-record the refund. AGENT.md §4.3.
   */
  const hash = verified.transaction.hash().toString('hex')
  const already = await prisma.reclaimBatch.findUnique({
    where: { transactionHash: hash },
    select: { balanceCount: true, amount: true, campaignId: true },
  })
  if (already && already.campaignId !== campaign.id) {
    // Unreachable while every claimed id is checked against this campaign
    // above, but falling through would hit the unique constraint and answer a
    // 500 to something that is really a refusal.
    return conflict('That transaction has already been recorded against another campaign.')
  }
  if (already) {
    const state = await settleReclaimStatus(campaign.id)
    return {
      kind: 'ok',
      value: {
        transactionHash: hash,
        balanceCount: already.balanceCount,
        amount: already.amount.toFixed(),
        remaining: state.remaining,
        campaignStatus: state.status,
        replay: true,
      },
    }
  }

  const amount = claimed.reduce((sum, id) => sum.plus(onLedger.get(id)!), new Decimal(0))

  let feeCharged: string | number | null = null
  try {
    feeCharged = (await deps.submit(verified.transaction))?.feeCharged ?? null
  } catch (error) {
    const code = horizonResultCode(error)
    logger.warn({ campaignId: campaign.id, code }, 'reclaim rejected by the network')
    return conflict(`Stellar rejected the reclaim: ${code}.`)
  }

  /*
   * Recorded in one transaction so a crash cannot leave links RECLAIMED with
   * no record of which transaction returned them — the sender's only evidence.
   */
  /*
   * The unique hash is the real guard, and losing the race is not an error.
   *
   * Two identical submissions can both pass the replay check above before
   * either has written — the read and the write are not one atomic step. The
   * loser hits `ReclaimBatch_transactionHash_key`, which is the constraint
   * DOING ITS JOB: exactly one record exists. Letting it propagate turned a
   * double-click into a 500 describing a reclaim that had in fact succeeded.
   */
  try {
    await prisma.$transaction([
      prisma.reclaimBatch.create({
        data: {
          campaignId: campaign.id,
          transactionHash: hash,
          balanceCount: claimed.length,
          amount: amount.toFixed(),
        },
      }),
      prisma.claimLink.updateMany({
        where: { id: { in: [...mine.values()] } },
        data: {
          status: 'RECLAIMED',
          claimedBy: campaign.senderPublicKey,
          claimedAt: new Date(),
          claimTxHash: hash,
        },
      }),
    ])
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const winner = await prisma.reclaimBatch.findUnique({
      where: { transactionHash: hash },
      select: { balanceCount: true, amount: true },
    })
    if (!winner) throw error
    const raced = await settleReclaimStatus(campaign.id)
    return {
      kind: 'ok',
      value: {
        transactionHash: hash,
        balanceCount: winner.balanceCount,
        amount: winner.amount.toFixed(),
        remaining: raced.remaining,
        campaignStatus: raced.status,
        replay: true,
      },
    }
  }

  const state = await settleReclaimStatus(campaign.id)

  // The reversal, valued at THIS moment (#80). Never fails the reclaim, which has happened.
  const recorded = await prisma.reclaimBatch.findUnique({ where: { transactionHash: hash }, select: { id: true } })
  if (recorded) {
    await recordReclaimValuation(recorded.id, feeCharged).catch((error: unknown) =>
      logger.error({ campaignId: campaign.id, reason: error instanceof Error ? error.message : 'unknown' }, 'reclaim valuation could not be recorded'),
    )
  }

  logger.info(
    { campaignId: campaign.id, hash, balances: claimed.length, amount: amount.toFixed() },
    'reclaim submitted',
  )

  return {
    kind: 'ok',
    value: {
      transactionHash: hash,
      balanceCount: claimed.length,
      amount: amount.toFixed(),
      remaining: state.remaining,
      campaignStatus: state.status,
      replay: false,
    },
  }
}

/**
 * Moves the campaign to RECLAIMED once nothing is left to return.
 *
 * "Nothing left" means no link is still ACTIVE or EXPIRED — a CLAIMED link is
 * not outstanding, it is finished. A campaign whose links were all claimed by
 * recipients never becomes RECLAIMED; there was nothing to reclaim.
 */
export async function settleReclaimStatus(
  campaignId: string,
): Promise<{ status: string; remaining: number }> {
  const remaining = await prisma.claimLink.count({
    where: { campaignId, status: { in: ['ACTIVE', 'EXPIRED'] } },
  })

  if (remaining > 0) {
    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      select: { status: true },
    })
    return { status: campaign.status, remaining }
  }

  const reclaimed = await prisma.claimLink.count({ where: { campaignId, status: 'RECLAIMED' } })
  if (reclaimed === 0) {
    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      select: { status: true },
    })
    return { status: campaign.status, remaining: 0 }
  }

  const reclaimedCampaign = await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'RECLAIMED' }, select: { organizationId: true } })
  await emitWebhook(reclaimedCampaign.organizationId, 'campaign.reclaimed', { campaignId })
  return { status: 'RECLAIMED', remaining: 0 }
}
