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
      links: { select: { id: true }, orderBy: { createdAt: 'asc' } },
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

  /*
   * One balance per link, in operation order. The envelope was verified at
   * submit time against these same links in this same order, so index i is
   * link i — but if the counts ever disagree the mapping is meaningless, and
   * writing a wrong balanceId would hand one recipient another's funds.
   */
  if (balanceIds.length !== batch.links.length) {
    throw new Error(
      `batch ${batchId}: ledger reported ${balanceIds.length} balances for ${batch.links.length} links`,
    )
  }

  const pairs = batch.links.map((link, index) => ({ linkId: link.id, balanceId: balanceIds[index]! }))

  // Read each one back off the ledger before calling any link claimable.
  await Promise.all(pairs.map(({ balanceId }) => horizon().claimableBalances().claimableBalance(balanceId).call()))

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
