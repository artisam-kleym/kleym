/**
 * The `batch-confirm` queue. SPEC.md §7.1.
 *
 * Producer side only — the consumer lives in src/workers/batch-confirm.ts so a
 * slow Horizon poll never runs inside a request.
 */
import { Queue } from 'bullmq'
import { QUEUE, queueConnection } from './connection'

export interface BatchConfirmJob {
  batchId: string
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

/**
 * Enqueues confirmation for a submitted batch.
 *
 * The job id is the batch id, so a re-submitted batch does not queue a second
 * confirmation — BullMQ deduplicates on it (AGENT.md §4.3).
 */
export async function enqueueBatchConfirm(batchId: string): Promise<void> {
  await batchConfirmQueue().add(QUEUE.batchConfirm, { batchId }, { jobId: `batch-confirm:${batchId}` })
}
