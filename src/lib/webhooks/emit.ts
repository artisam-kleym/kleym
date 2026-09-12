/**
 * Emitting an event. Issue #51.
 *
 * One delivery row per subscribed endpoint, then one job per row. The row is
 * the log an operator inspects; the job is the retry. Emission never fails
 * the action that raised it: a claim is not un-claimed because a webhook
 * could not be queued — the row (or the log line) says it was not.
 */
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { containsSecretSeed } from '@/lib/validation/stellar'
import { enqueueWebhook } from './queue'
import type { WebhookEnvelope, WebhookEvent, WebhookPayloads } from './events'

/**
 * A payload that could carry a claim link, a fragment, a seed, or an address
 * someone typed. Checked on the SERIALISED body, so a value hiding in a
 * nested field or a key name is seen too. Throws: this is a programming
 * error at the call site, not a runtime condition to log and move on from.
 */
export function assertPayloadSafe(body: string): void {
  if (containsSecretSeed(body)) throw new Error('webhook payload contains a secret seed')
  if (/#s=|[?&]s=/.test(body)) throw new Error('webhook payload contains a claim fragment')
  if (/\/claim\b/.test(body)) throw new Error('webhook payload contains a claim URL')
  if (/[^\s"']+@[^\s"']+\.[a-z]{2,}/i.test(body)) throw new Error('webhook payload contains an email address')
}

export interface EmitResult {
  deliveries: number
}

/**
 * Fans out to every endpoint of `organizationId` subscribed to `event`.
 * `organizationId: null` (platform events like `sponsor.low`) fans out to
 * every endpoint subscribed anywhere.
 */
export async function emitWebhook<E extends WebhookEvent>(organizationId: string | null, event: E, data: WebhookPayloads[E]): Promise<EmitResult> {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { ...(organizationId ? { organizationId } : {}), disabledAt: null, events: { has: event } },
      select: { id: true, organizationId: true },
    })
    if (endpoints.length === 0) return { deliveries: 0 }

    let queued = 0
    for (const endpoint of endpoints) {
      const id = `whd_${randomBytes(12).toString('hex')}`
      const envelope: WebhookEnvelope<E> = { id, event, createdAt: new Date().toISOString(), organizationId: endpoint.organizationId, data }
      assertPayloadSafe(JSON.stringify(envelope))
      await prisma.webhookDelivery.create({ data: { id, endpointId: endpoint.id, event, payload: envelope as object } })
      try {
        await enqueueWebhook(id)
        queued += 1
      } catch (error) {
        // The row exists and says PENDING with no attempt; the delivery page shows it.
        logger.error({ deliveryId: id, event, reason: error instanceof Error ? error.message : 'unknown' }, 'webhook delivery could not be queued')
      }
    }
    return { deliveries: queued }
  } catch (error) {
    if (error instanceof Error && /webhook payload contains/.test(error.message)) throw error
    logger.error({ event, reason: error instanceof Error ? error.message : 'unknown' }, 'webhook emit failed')
    return { deliveries: 0 }
  }
}
