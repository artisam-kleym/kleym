/**
 * The `email-deliver` queue. SPEC.md §6.5.
 *
 * Historical bearer delivery persisted full URLs in Redis payloads. Current
 * deployments refuse new bearer jobs and hold existing ones for operator review.
 * The legacy development-only Testnet path uses these retention settings:
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
import { legacyBearerEmailAllowed, LOCAL_DELIVERY_NOTICE } from '@/lib/email/delivery-policy'

/**
 * Historical job shape. `claimUrl` is persisted by BullMQ, and is therefore
 * forbidden at ingress in current deployments. Held jobs require operator review.
 */
export interface DeliveryJob {
  kind?: 'claim'
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

/**
 * A reminder (#78) rides the same queue with the same retention, and carries
 * NO claim URL — Kleym no longer has it. The type makes that structural: there
 * is no field to put one in.
 */
export interface ReminderJob {
  kind: 'reminder'
  deliveryId: string
  linkId: string
  email: string
  senderName: string
  campaignName: string
  amount: string
  assetCode: string
  expiresAt: string
  /** When the original message went, so the reminder can point at it. */
  sentAt: string
  /** Days before expiry this reminder represents. */
  point: number
}

/**
 * A signed receipt (#81) to the recipient who just claimed. Same queue, same
 * retention; no claim URL, and the type again has no field for one. What it
 * carries is what the ledger shows anyone — the claimant address and the
 * transaction — plus the receipt's own bytes and signature.
 */
export interface ReceiptJob {
  kind: 'receipt'
  deliveryId: string
  linkId: string
  email: string
  senderName: string
  amount: string
  assetCode: string
  recipient: string
  claimedAt: string
  transactionHash: string
  receiptId: string
  canonical: string
  signature: string
  publicKey: string
}

export type EmailJob = DeliveryJob | ReminderJob | ReceiptJob

let queue: Queue<EmailJob> | undefined

export function deliveryJobs(): Queue<EmailJob> {
  return (queue ??= new Queue<EmailJob>(QUEUE.emailDeliver, {
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
  if (!legacyBearerEmailAllowed()) throw new Error(LOCAL_DELIVERY_NOTICE)
  /*
   * Deduplicated on the delivery row, so a sender who double-clicks "Send"
   * does not email the same person twice — and, more to the point, does not
   * put a second copy of the same claim URL into Redis.
   */
  await deliveryJobs().add(QUEUE.emailDeliver, job, {
    deduplication: { id: `deliver:${job.deliveryId}` },
  })
}

/** One receipt email per link: a retried submit cannot mail it twice. */
export async function enqueueReceipt(job: ReceiptJob): Promise<void> {
  await deliveryJobs().add(QUEUE.emailDeliver, job, {
    deduplication: { id: `receipt:${job.linkId}` },
  })
}

/** One reminder per delivery per point, however many passes see it due. */
export async function enqueueReminder(job: ReminderJob): Promise<void> {
  await deliveryJobs().add(QUEUE.emailDeliver, job, {
    deduplication: { id: `remind:${job.deliveryId}:${job.point}` },
  })
}
