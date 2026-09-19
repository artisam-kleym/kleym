/**
 * The `email-deliver` consumer. SPEC.md §6.5.
 *
 * The claim URL exists here as a local inside one function call and goes to
 * the mail provider. It is not logged, not stored, and not returned — the job
 * return value is a provider id, because BullMQ persists return values and a
 * URL in one would outlive the payload this queue is careful to delete.
 */
import { Worker } from 'bullmq'
import { logger } from '@/lib/config/logger'
import { QUEUE, queueConnection } from '@/lib/queue/connection'
import type { EmailJob } from '@/lib/queue/email'
import { claimEmail, receiptEmail, reminderEmail } from '@/lib/email/templates'
import { resend, type Mailer } from '@/lib/email/provider'
import { prisma } from '@/lib/db/client'

export function startEmailWorker(mailer: Mailer = resend): Worker<EmailJob> {
  const worker = new Worker<EmailJob>(
    QUEUE.emailDeliver,
    async (job) => {
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
