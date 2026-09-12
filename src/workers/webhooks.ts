/** The webhook delivery consumer. Issue #51. */
import { Worker, type Job } from 'bullmq'
import { queueConnection } from '@/lib/queue/connection'
import { attemptDelivery } from '@/lib/webhooks/deliver'
import { WEBHOOK_QUEUE, type WebhookJob } from '@/lib/webhooks/queue'

export function startWebhookWorker(): Worker<WebhookJob> {
  return new Worker<WebhookJob>(
    WEBHOOK_QUEUE,
    async (job: Job<WebhookJob>) => {
      const attempt = job.attemptsMade + 1
      const isLast = attempt >= (job.opts.attempts ?? 1)
      const outcome = await attemptDelivery(job.data.deliveryId, attempt, isLast)
      // A failure that is not the last throws so BullMQ schedules the retry.
      if (outcome.kind === 'failed' && !isLast) throw new Error(outcome.reason)
      return outcome.kind
    },
    { connection: queueConnection(), concurrency: 8 },
  )
}
