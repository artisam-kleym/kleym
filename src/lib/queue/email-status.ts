import { Queue } from 'bullmq'
import { QUEUE, queueConnection } from './connection'

/** No code, email address, payload, token or private URL is queued here. */
export interface EmailStatusJob { deliveryId: string; providerId: string }
let queue: Queue<EmailStatusJob> | undefined
export function emailStatusJobs(): Queue<EmailStatusJob> {
  return (queue ??= new Queue<EmailStatusJob>(QUEUE.emailStatus, { connection: queueConnection() }))
}
export async function enqueueEmailStatus(data: EmailStatusJob): Promise<void> {
  await emailStatusJobs().add('check', data, {
    jobId: `zender-${data.providerId}`, delay: 15_000, attempts: 6,
    backoff: { type: 'zender-status', delay: 30_000 },
    removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: { age: 604800, count: 1000 },
  })
}
