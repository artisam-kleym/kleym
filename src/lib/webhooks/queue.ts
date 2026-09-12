/** The `webhook-deliver` queue. Issue #51. One job per delivery row. */
import { Queue } from 'bullmq'
import { queueConnection } from '@/lib/queue/connection'

export const WEBHOOK_QUEUE = 'webhook-deliver'

export interface WebhookJob {
  deliveryId: string
}

/** Attempts and backoff: 30 s, 1 min, 2, 4, 8, 16, 32 min — about an hour, then parked. */
export const WEBHOOK_ATTEMPTS = 7
export const WEBHOOK_BACKOFF_MS = 30_000

let queue: Queue<WebhookJob> | undefined

export function webhookQueue(): Queue<WebhookJob> {
  return (queue ??= new Queue<WebhookJob>(WEBHOOK_QUEUE, {
    connection: queueConnection(),
    defaultJobOptions: {
      attempts: WEBHOOK_ATTEMPTS,
      backoff: { type: 'exponential', delay: WEBHOOK_BACKOFF_MS },
      removeOnComplete: { age: 3_600, count: 1_000 },
      removeOnFail: { age: 86_400 },
    },
  }))
}

export async function enqueueWebhook(deliveryId: string, opts: { attempts?: number; backoffMs?: number } = {}): Promise<void> {
  await webhookQueue().add(WEBHOOK_QUEUE, { deliveryId }, {
    jobId: `webhook-${deliveryId}`,
    ...(opts.attempts ? { attempts: opts.attempts } : {}),
    ...(opts.backoffMs ? { backoff: { type: 'exponential', delay: opts.backoffMs } } : {}),
  })
}
