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
import { horizonResultCode } from './batches'

/** How long a prepared envelope stays valid for the sender to sign. */
const SIGNING_WINDOW_SECONDS = 600

export const reclaimPrepareSchema = z
  .object({
    /** Omit for the first batch. */
    sequence: z.number().int().positive().optional(),
  })
  .strict()

export const reclaimSubmitSchema = z.object({ signedXdr: z.string().min(1) }).strict()

export type ReclaimPrepareInput = z.infer<typeof reclaimPrepareSchema>
export type ReclaimSubmitInput = z.infer<typeof reclaimSubmitSchema>

export type ReclaimOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not-found' }
  | { kind: 'conflict'; detail: string }

const conflict = (detail: string) => ({ kind: 'conflict' as const, detail })

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
  submit: (transaction: Transaction) => Promise<void>
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

const liveSubmit = async (transaction: Transaction): Promise<void> => {
  await horizon().submitTransaction(transaction)
}

const LIVE: ReclaimDeps = {
  readBalances: readSenderBalances,
  loadAccount: liveAccount,
  submit: liveSubmit,
}

async function loadCampaign(campaignId: string, userId: string) {
  return prisma.campaign.findFirst({
    where: owned(campaignId, userId),
    select: {
      id: true, name: true, status: true, senderPublicKey: true,
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
  sequence: number
  totalBatches: number
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
  userId: string,
  input: ReclaimPrepareInput,
  deps: ReclaimDeps = LIVE,
): Promise<ReclaimOutcome<PreparedReclaim>> {
  const campaign = await loadCampaign(campaignId, userId)
  if (!campaign) return { kind: 'not-found' }

  if (Date.now() < campaign.expiresAt.getTime()) {
    return conflict(
      `This campaign does not expire until ${campaign.expiresAt.toISOString()}. Unclaimed funds can only be returned after that.`,
    )
  }

  const available = await reclaimable(campaign, deps)
  if (available.length === 0) {
    return conflict('There is nothing left to reclaim — the ledger holds no unclaimed balances for this campaign.')
  }

  const batches = chunkLinks(available, env.MAX_OPS_PER_BATCH)
  const sequence = input.sequence ?? 1
  const target = batches[sequence - 1]
  if (!target) return { kind: 'not-found' }

  const senderAccount = await deps.loadAccount(campaign.senderPublicKey)
  if (!senderAccount) {
    return conflict('The sender account does not exist on this network. Fund it and try again.')
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
      sequence,
      totalBatches: batches.length,
      balanceCount: target.length,
      amount: target.reduce((sum, b) => sum.plus(b.amount), new Decimal(0)).toString(),
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
  userId: string,
  input: ReclaimSubmitInput,
  deps: ReclaimDeps = LIVE,
): Promise<ReclaimOutcome<SubmittedReclaim>> {
  const campaign = await loadCampaign(campaignId, userId)
  if (!campaign) return { kind: 'not-found' }

  if (Date.now() < campaign.expiresAt.getTime()) {
    return conflict('This campaign has not expired yet.')
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
        amount: already.amount.toString(),
        remaining: state.remaining,
        campaignStatus: state.status,
        replay: true,
      },
    }
  }

  const amount = claimed.reduce((sum, id) => sum.plus(onLedger.get(id)!), new Decimal(0))

  try {
    await deps.submit(verified.transaction)
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
          amount: amount.toString(),
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
        amount: winner.amount.toString(),
        remaining: raced.remaining,
        campaignStatus: raced.status,
        replay: true,
      },
    }
  }

  const state = await settleReclaimStatus(campaign.id)

  logger.info(
    { campaignId: campaign.id, hash, balances: claimed.length, amount: amount.toString() },
    'reclaim submitted',
  )

  return {
    kind: 'ok',
    value: {
      transactionHash: hash,
      balanceCount: claimed.length,
      amount: amount.toString(),
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

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'RECLAIMED' } })
  return { status: 'RECLAIMED', remaining: 0 }
}
