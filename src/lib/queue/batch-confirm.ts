/**
 * The `batch-confirm` queue. SPEC.md §7.1.
 *
 * Producer side only — the consumer lives in src/workers/batch-confirm.ts so a
 * slow Horizon poll never runs inside a request.
 */
import { Queue } from 'bullmq'
import { QUEUE, queueConnection } from './connection'
import { traceCarrier } from '@/lib/observability/tracing'

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
export const batchConfirmJobId = (batchId: string) => `batch-confirm-${batchId}`

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
export async function enqueueBatchConfirm(batchId: string): Promise<void> {
  await batchConfirmQueue().add(QUEUE.batchConfirm, { batchId, trace: traceCarrier() }, { jobId: batchConfirmJobId(batchId) })
}
