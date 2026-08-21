/**
 * The `batch-confirm` consumer. SPEC.md §7.1.
 *
 * Runs after a batch is submitted: waits for the transaction to appear in a
 * closed ledger, takes the balance IDs the LEDGER assigned out of the result
 * XDR, confirms each balance actually exists, then marks the links ACTIVE.
 *
 * AGENT.md §4.2 — the chain is authoritative. Nothing here trusts the database
 * or the client about whether money moved; the database is updated from what
 * Horizon reports, and a disagreement resolves in the chain's favour.
 */
import { Worker, type Job } from 'bullmq'
import { logger } from '@/lib/config/logger'
import { prisma } from '@/lib/db/client'
import { QUEUE, queueConnection } from '@/lib/queue/connection'
import type { BatchConfirmJob } from '@/lib/queue/batch-confirm'
import { confirmBatch, markBatchFailed } from '@/lib/api/batches'
import { LINK_ORDER } from '@/lib/api/link-order'
import { balanceIdsFromResultXdr } from '@/lib/stellar/batch'
import { horizon } from '@/lib/stellar/horizon'

/**
 * Processes one batch.
 *
 * Idempotent in both directions: a batch already CONFIRMED or FAILED returns
 * immediately, and a transaction Horizon has not indexed yet throws so BullMQ
 * retries rather than concluding it failed. "Not found yet" and "did not
 * happen" are different answers, and treating the first as the second would
 * mark real, funded links FAILED.
 */
export async function confirmOne(batchId: string): Promise<'confirmed' | 'failed' | 'already-settled'> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: {
      id: true, campaignId: true, sequence: true, status: true, transactionHash: true,
      links: { select: { id: true, ephemeralPublicKey: true }, orderBy: LINK_ORDER },
    },
  })
  if (!batch) throw new Error(`batch ${batchId} no longer exists`)
  if (batch.status === 'CONFIRMED' || batch.status === 'FAILED') return 'already-settled'
  if (!batch.transactionHash) throw new Error(`batch ${batchId} is ${batch.status} with no transaction hash`)

  const transaction = await horizon().transactions().transaction(batch.transactionHash).call()

  if (!transaction.successful) {
    // In a closed ledger and rejected. This one is settled, not pending.
    await markBatchFailed(batch.id, batch.campaignId, 'tx_failed')
    logger.error({ batchId, sequence: batch.sequence, hash: batch.transactionHash }, 'batch failed on ledger')
    return 'failed'
  }

  const balanceIds = balanceIdsFromResultXdr(transaction.result_xdr)

  if (balanceIds.length !== batch.links.length) {
    throw new Error(
      `batch ${batchId}: ledger reported ${balanceIds.length} balances for ${batch.links.length} links`,
    )
  }

  /*
   * The mapping is DERIVED FROM THE LEDGER, not from list position.
   *
   * Operation index i produced balance i, and link i signed operation i — so
   * pairing by index is correct as long as two separate queries agree about
   * what "link i" is. That is an assumption about ordering, and the cost of it
   * being wrong is a link marked ACTIVE against a balance only somebody else's
   * ephemeral key can claim: the recipient's claim fails, and the database is
   * confidently wrong about which balance is which.
   *
   * So the balance is fetched — which this already did, to prove existence —
   * and matched to the link whose ephemeral key is actually one of its
   * claimants. AGENT.md §4.2: the chain is authoritative, and it is the chain
   * that knows who can claim what. A count check cannot see a permutation;
   * this can.
   */
  const balances = await Promise.all(
    balanceIds.map((balanceId) => horizon().claimableBalances().claimableBalance(balanceId).call()),
  )

  const byEphemeralKey = new Map(batch.links.map((link) => [link.ephemeralPublicKey, link.id]))
  const pairs: { linkId: string; balanceId: string }[] = []

  for (const balance of balances) {
    const claimant = balance.claimants
      .map((c) => c.destination)
      .find((destination) => byEphemeralKey.has(destination))

    if (!claimant) {
      throw new Error(
        `batch ${batchId}: balance ${balance.id} names no ephemeral key belonging to this batch`,
      )
    }

    pairs.push({ linkId: byEphemeralKey.get(claimant)!, balanceId: balance.id })
    // Each link claims exactly one balance; a second match would mean two
    // balances were created for one recipient, which is not a thing to guess at.
    byEphemeralKey.delete(claimant)
  }

  if (byEphemeralKey.size > 0) {
    throw new Error(
      `batch ${batchId}: ${byEphemeralKey.size} link(s) have no balance on the ledger`,
    )
  }

  await confirmBatch(batch.id, batch.campaignId, pairs)
  logger.info({ batchId, sequence: batch.sequence, links: pairs.length }, 'batch confirmed')
  return 'confirmed'
}

export function startBatchConfirmWorker(): Worker<BatchConfirmJob> {
  const worker = new Worker<BatchConfirmJob>(
    QUEUE.batchConfirm,
    async (job: Job<BatchConfirmJob>) => confirmOne(job.data.batchId),
    { connection: queueConnection(), concurrency: 4 },
  )

  worker.on('failed', (job, error) => {
    logger.warn(
      { batchId: job?.data.batchId, attempt: job?.attemptsMade, reason: error.message },
      'batch-confirm attempt failed',
    )
  })

  return worker
}
