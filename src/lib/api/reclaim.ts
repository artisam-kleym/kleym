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
import { Account, Keypair, type Transaction } from '@stellar/stellar-sdk'
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
import { executeAttempt, lookupAttempt, prepareAttempt, type AttemptLookup } from '@/lib/stellar/attempts'
import { sponsorFor, sponsorSecret } from '@/lib/stellar/sponsors'
import { sponsorSpendable } from '@/lib/stellar/horizon'

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
  lookup?: AttemptLookup
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
  if (response.successful !== true || !Number.isInteger(response.ledger) || response.hash !== transaction.hash().toString('hex')) {
    throw new Error('Reclaim ledger inclusion is not confirmed')
  }
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
      assetCode: true, assetIssuer: true, amountPerLink: true, expiresAt: true, fundingMode: true,
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
  feePayer: string
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

  const scope = `reclaim:${campaign.id}`
  const pending = await prisma.ledgerAttempt.findUnique({ where: { scope } })
  if (pending?.submittedXdr && (pending.status === 'SUBMITTED' || pending.status === 'CONFIRMED')) {
    const recovered = await submitReclaim(campaignId, organizationId, { signedXdr: pending.submittedXdr }, deps)
    if (recovered.kind !== 'ok') return recovered
  }

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

  const sponsor = campaign.fundingMode === 'SPONSORED' ? sponsorFor(campaign.sponsorPublicKey) : null
  if (campaign.fundingMode === 'SPONSORED' && !sponsor) return conflict('The campaign sponsor is unavailable.')
  const sponsorAccount = sponsor ? await deps.loadAccount(sponsor.publicKey) : null
  if (sponsor && !sponsorAccount) return conflict('The sponsor account is unavailable on this network.')
  if (sponsor && deps === LIVE && (await sponsorSpendable(sponsor.publicKey)).lessThan(
    new Decimal(env.BASE_FEE_STROOPS).times(target.length).div('10000000'),
  )) return conflict('The sponsor cannot cover the reclaim fee right now. Try again shortly.')

  const { xdr } = buildReclaimTransaction({
    senderAccount,
    senderPublicKey: campaign.senderPublicKey,
    ...(sponsorAccount ? { sponsorAccount } : {}),
    balanceIds: target.map((b) => b.balanceId),
    networkPassphrase: env.NETWORK_PASSPHRASE,
    baseFee: env.BASE_FEE_STROOPS,
    timeoutSeconds: SIGNING_WINDOW_SECONDS,
  })

  const value = {
    batchesRemaining: batches.length, balanceCount: target.length,
    amount: target.reduce((sum, b) => sum.plus(b.amount), new Decimal(0)).toFixed(),
    networkPassphrase: env.NETWORK_PASSPHRASE,
    feePayer: sponsor?.publicKey ?? campaign.senderPublicKey,
  }
  if (pending?.status === 'PREPARED') {
    const priorIds = claimedBalanceIds(pending.preparedXdr, env.NETWORK_PASSPHRASE) ?? []
    if (priorIds.length !== target.length || priorIds.some((id, index) => id !== target[index]?.balanceId) ||
      (pending.metadata as { amount: string }).amount !== value.amount) {
      await prisma.ledgerAttempt.updateMany({ where: { scope, status: 'PREPARED', transactionHash: pending.transactionHash },
        data: { status: 'FAILED' } })
    }
  }
  const attempt = await prepareAttempt(scope, campaign.id, 'RECLAIM', xdr, value)
  return {
    kind: 'ok',
    value: {
      ...attempt.metadata as unknown as Omit<PreparedReclaim, 'xdr'>,
      xdr: attempt.preparedXdr,
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

  const attempt = await prisma.ledgerAttempt.findUnique({ where: { scope: `reclaim:${campaign.id}` } })
  const sponsor = campaign.fundingMode === 'SPONSORED' ? sponsorFor(campaign.sponsorPublicKey) : null
  if (campaign.fundingMode === 'SPONSORED' && (!sponsor || !attempt)) {
    return conflict('Prepare the reclaim with its campaign sponsor before signing.')
  }
  const verified = verifyReclaimTransaction(input.signedXdr, {
    senderPublicKey: campaign.senderPublicKey,
    ...(sponsor ? { sponsorPublicKey: sponsor.publicKey, preparedHash: attempt!.transactionHash } : {}),
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
    if (attempt?.transactionHash === hash) await prisma.ledgerAttempt.updateMany({ where: { scope: attempt.scope, transactionHash: hash, status: 'CONFIRMED' }, data: { status: 'SETTLED' } })
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

  let amount: Decimal
  if (attempt && attempt.transactionHash === hash && attempt.status !== 'PREPARED') {
    // The balance can already be gone when a response was lost. Its exact
    // amount was bound from the ledger before the original submission.
    amount = new Decimal((attempt.metadata as { amount: string }).amount)
  } else {
    const onLedger = await deps.readBalances(campaign.senderPublicKey)
    const gone = claimed.filter((id) => !onLedger.has(id))
    if (gone.length > 0) {
      if (attempt?.status === 'PREPARED') await prisma.ledgerAttempt.updateMany({
        where: { scope: attempt.scope, status: 'PREPARED', transactionHash: hash }, data: { status: 'FAILED' },
      })
      return conflict(`${gone.length} balances were claimed while you were signing. Prepare the reclaim again.`)
    }
    amount = claimed.reduce((sum, id) => sum.plus(onLedger.get(id)!), new Decimal(0))
  }
  if (attempt?.status === 'FAILED') return conflict('The previous reclaim failed. Prepare it again before signing.')

  let feeCharged: string | number | null = null
  try {
    if (sponsor) verified.transaction.sign(Keypair.fromSecret(sponsorSecret(sponsor.publicKey)))
    if (attempt && attempt.transactionHash === hash) {
      const result = await executeAttempt(attempt, verified.transaction, async (transaction) => {
        const response = await deps.submit(transaction)
        // liveSubmit waits for ledger inclusion, not merely HTTP acceptance.
        return { hash: transaction.hash().toString('hex'), successful: true, feeCharged: response?.feeCharged }
      }, deps.lookup ?? (deps === LIVE ? lookupAttempt : async () => null))
      if (!result.successful) return conflict('The reclaim failed on ledger. Prepare it again.')
      feeCharged = result.feeCharged ?? null
    } else {
      feeCharged = (await deps.submit(verified.transaction))?.feeCharged ?? null
    }
  } catch (error) {
    const code = horizonResultCode(error)
    logger.warn({ campaignId: campaign.id, code }, 'reclaim rejected by the network')
    return conflict(attempt ? 'The reclaim is awaiting confirmation. Retry to check the same transaction; do not send another refund.' : `Stellar rejected the reclaim: ${code}.`)
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
      ...(attempt?.transactionHash === hash ? [prisma.ledgerAttempt.updateMany({
        where: { scope: attempt.scope, transactionHash: hash, status: 'CONFIRMED' }, data: { status: 'SETTLED' },
      })] : []),
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
