import { Worker, UnrecoverableError } from 'bullmq'
import { QUEUE, queueConnection } from '@/lib/queue/connection'
import type { EmailStatusJob } from '@/lib/queue/email-status'
import { zenderMessageStatus, ZenderError } from '@/lib/email/zender'
import { logger } from '@/lib/config/logger'

export async function checkEmailStatus(data: EmailStatusJob): Promise<{ status: string }> {
  const status = await zenderMessageStatus(data.providerId)
  if (['queued', 'sending', 'sent'].includes(status)) throw new Error('Zender delivery remains unconfirmed')
  if (!['delivered', 'opened', 'clicked'].includes(status)) {
    throw new UnrecoverableError(`Zender delivery ended with ${status}`)
  }
  logger.info({ ...data, status }, 'Zender provider delivery confirmed')
  return { status }
}

export function emailStatusBackoff(attempt: number, _type: string | undefined, error?: Error): number {
  const requested = error instanceof ZenderError ? (error.retryAfterSeconds ?? 0) * 1000 : 0
  return Math.max(30_000 * 2 ** Math.max(0, attempt - 1), requested)
}

export function startEmailStatusWorker(): Worker<EmailStatusJob> {
  const worker = new Worker<EmailStatusJob>(QUEUE.emailStatus, (job) => checkEmailStatus(job.data),
    { connection: queueConnection(), concurrency: 2, settings: { backoffStrategy: emailStatusBackoff } })
  worker.on('failed', (job, error) => {
    const final = error instanceof UnrecoverableError || (job?.attemptsMade ?? 0) >= (job?.opts.attempts ?? 6)
    const fields = { deliveryId: job?.data.deliveryId, providerId: job?.data.providerId, attempt: job?.attemptsMade,
      reason: error instanceof UnrecoverableError ? error.message : 'Zender status pending or lookup unavailable' }
    if (final) logger.error(fields, 'Zender email needs operator review; no mail resent')
    else logger.warn(fields, 'Zender email status will be checked again')
  })
  return worker
}
