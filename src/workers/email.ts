/**
 * The `email-deliver` consumer. SPEC.md §6.5.
 *
 * Current deployments hold historical bearer jobs before reading their URL.
 * Receipt/reminder messages contain no claim URL. In the Testnet development
 * legacy harness only, the URL goes to the injected provider from a Redis job;
 * deleting a completed job cannot erase historical backups/provider copies.
 */
import { Worker, DelayedError, type Job } from 'bullmq'
import { logger } from '@/lib/config/logger'
import { QUEUE, queueConnection } from '@/lib/queue/connection'
import type { EmailJob } from '@/lib/queue/email'
import { claimEmail, receiptEmail, reminderEmail } from '@/lib/email/templates'
import { resend, type Mailer } from '@/lib/email/provider'
import { prisma } from '@/lib/db/client'
import { legacyBearerEmailAllowed } from '@/lib/email/delivery-policy'

/** Existing Redis payloads are held explicitly, not mailed or silently purged. */
export async function holdBlockedBearerJob(job: Pick<Job<EmailJob>, 'data' | 'id' | 'moveToDelayed'>, token?: string): Promise<void> {
  if (job.data.kind === 'receipt' || job.data.kind === 'reminder' || legacyBearerEmailAllowed()) return
  await job.moveToDelayed(Date.now() + 3_600_000, token)
  logger.warn({ jobId: job.id, linkId: job.data.linkId }, 'legacy bearer email held; operator review required')
  throw new DelayedError()
}

export function startEmailWorker(mailer: Mailer = resend): Worker<EmailJob> {
  const worker = new Worker<EmailJob>(
    QUEUE.emailDeliver,
    async (job, token) => {
      await holdBlockedBearerJob(job, token)
      if (job.data.kind === 'reminder') {
        // No URL anywhere in this branch — the job has no field for one (#78).
        const reminder = job.data
        const message = reminderEmail({
          senderName: reminder.senderName,
          campaignName: reminder.campaignName,
          amount: reminder.amount,
          assetCode: reminder.assetCode,
          expiresAt: new Date(reminder.expiresAt),
          sentAt: new Date(reminder.sentAt),
        })
        const { id } = await mailer({ to: reminder.email, ...message })
        logger.info({ deliveryId: reminder.deliveryId, point: reminder.point, providerId: id }, 'reminder email sent')
        return { providerId: id }
      }

      if (job.data.kind === 'receipt') {
        // No URL anywhere in this branch either — the receipt names the ledger's facts (#81).
        const receipt = job.data
        const message = receiptEmail({
          senderName: receipt.senderName,
          amount: receipt.amount,
          assetCode: receipt.assetCode,
          recipient: receipt.recipient,
          claimedAt: new Date(receipt.claimedAt),
          transactionHash: receipt.transactionHash,
          receiptId: receipt.receiptId,
          canonical: receipt.canonical,
          signature: receipt.signature,
          publicKey: receipt.publicKey,
        })
        const { id } = await mailer({ to: receipt.email, ...message })
        logger.info({ deliveryId: receipt.deliveryId, receiptId: receipt.receiptId, providerId: id }, 'receipt email sent')
        return { providerId: id }
      }

      const { deliveryId, email, claimUrl, senderName, amount, assetCode, expiresAt, otpRequired } =
        job.data

      const message = claimEmail({
        senderName,
        amount,
        assetCode,
        claimUrl,
        expiresAt: new Date(expiresAt),
        otpRequired,
      })

      const { id } = await mailer({ to: email, ...message })

      await prisma.delivery.update({
        where: { id: deliveryId },
        data: { sentAt: new Date() },
      })

      // The delivery id and the provider's id. Never the address, never the URL.
      logger.info({ deliveryId, providerId: id }, 'claim email sent')
      return { providerId: id }
    },
    { connection: queueConnection(), concurrency: 5 },
  )

  worker.on('failed', (job, error) => {
    /*
     * `job.data` is deliberately not logged, here least of all — a failure
     * handler dumping the payload is the classic way a secret reaches a log.
     */
    logger.warn(
      { deliveryId: job?.data?.deliveryId, attempt: job?.attemptsMade, reason: error.message },
      'claim email delivery attempt failed',
    )
  })

  return worker
}
