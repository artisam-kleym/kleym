/**
 * The `batch-confirm` queue. SPEC.md §7.1.
 *
 * Producer side only — the consumer lives in src/workers/batch-confirm.ts so a
 * slow Horizon poll never runs inside a request.
 */
import { Queue } from 'bullmq'
import { QUEUE, queueConnection } from './connection'
import { traceCarrier } from '@/lib/observability/tracing'
import { prisma } from '@/lib/db/client'
import { env } from '@/lib/config/env'

export interface BatchConfirmJob {
  batchId: string
  /** W3C trace context of the request that enqueued it (#53), so the worker's span joins its trace. */
  trace?: Record<string, string>
}

let cached: Queue<BatchConfirmJob> | undefined

export function batchConfirmQueue(): Queue<BatchConfirmJob> {
  return (cached ??= new Queue<BatchConfirmJob>(QUEUE.batchConfirm, {
    connection: queueConnection(),
    defaultJobOptions: {
      /*
       * Horizon can take several ledgers to report a transaction, and a
       * submitted transaction does not become un-submitted because the poll
       * failed. Retry generously; the worker itself is idempotent.
       */
      attempts: 10,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: { age: 7 * 86_400 },
    },
  }))
}

/** The job id for a batch. No colon: BullMQ 6 refuses a custom id containing one. */
export const batchConfirmJobId = (batchId: string, hash?: string) => `batch-confirm-${batchId}${hash ? `-${hash}` : ''}`

/**
 * Enqueues confirmation for a submitted batch.
 *
 * The job id is the batch id, so a re-submitted batch does not queue a second
 * confirmation — BullMQ deduplicates on it (AGENT.md §4.3).
 *
 * The id was `batch-confirm:<id>` until the BullMQ 6 bump (#55), which
 * refuses a custom id with a colon in it — so every submission since then
 * logged "confirmation could not be queued" and waited for reconciliation.
 * Found by verify:observability enqueuing under a trace (#53) and by the
 * SDK end-to-end run in verify:write-api (#51).
 */
export async function enqueueBatchConfirm(batchId: string, hash?: string): Promise<void> {
  const queue = batchConfirmQueue()
  const jobId = batchConfirmJobId(batchId, hash)
  const existing = await queue.getJob(jobId)
  if (existing && await existing.getState() === 'failed') {
    await existing.retry()
    return
  }
  await queue.add(QUEUE.batchConfirm, { batchId, trace: traceCarrier() }, { jobId })
}

/** Repairs a crash between recording a signed attempt and enqueueing confirmation. */
export async function recoverSubmittedFunding(campaignId?: string): Promise<number> {
  const batches = await prisma.batch.findMany({
    where: { status: 'SUBMITTED', submittedXdr: { not: null }, transactionHash: { not: null },
      ...(campaignId ? { campaignId } : {}), campaign: { network: env.STELLAR_NETWORK } },
    select: { id: true, transactionHash: true }, orderBy: { submittedAt: 'asc' }, take: 1000,
  })
  for (const batch of batches) await enqueueBatchConfirm(batch.id, batch.transactionHash!)
  return batches.length
}
