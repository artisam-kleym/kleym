/**
 * The `email-deliver` queue. SPEC.md §6.5.
 *
 * This queue carries the ONE piece of link material that transits Kleym's
 * infrastructure, so its retention settings are a security control rather than
 * housekeeping:
 *
 *   removeOnComplete: true   — the payload leaves Redis the moment it is sent.
 *   removeOnFail: true       — and when it is finally NOT sent, too.
 *
 * `removeOnFail: true` is the part that is easy to get wrong. Every other
 * queue in this system keeps failed jobs for a week so they can be inspected,
 * which is right for a batch id and catastrophic here: an exhausted delivery
 * would leave a claim URL sitting in Redis indefinitely, which is exactly what
 * SPEC.md §6.5 forbids. Failures are recorded in the DATABASE instead, without
 * the URL — see lib/api/deliver.ts.
 */
import { Queue } from 'bullmq'
import { QUEUE, queueConnection } from './connection'

/**
 * What one delivery needs. `claimUrl` is the exception (SPEC.md §6.5): it is
 * passed to the mail provider and discarded, never persisted, never logged.
 */
export interface DeliveryJob {
  deliveryId: string
  linkId: string
  email: string
  claimUrl: string
  senderName: string
  amount: string
  assetCode: string
  expiresAt: string
  otpRequired: boolean
}

let queue: Queue<DeliveryJob> | undefined

export function deliveryJobs(): Queue<DeliveryJob> {
  return (queue ??= new Queue<DeliveryJob>(QUEUE.emailDeliver, {
    connection: queueConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      // Both true, and both deliberate. See the note above.
      removeOnComplete: true,
      removeOnFail: true,
    },
  }))
}

export async function enqueueDelivery(job: DeliveryJob): Promise<void> {
  /*
   * Deduplicated on the delivery row, so a sender who double-clicks "Send"
   * does not email the same person twice — and, more to the point, does not
   * put a second copy of the same claim URL into Redis.
   */
  await deliveryJobs().add(QUEUE.emailDeliver, job, {
    deduplication: { id: `deliver:${job.deliveryId}` },
  })
}
