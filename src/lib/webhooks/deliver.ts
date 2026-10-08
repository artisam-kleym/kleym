/**
 * One delivery attempt. Issue #51.
 *
 * Signs the stored body, POSTs it within a bound, records the outcome on the
 * row. A non-2xx or a transport failure throws so BullMQ retries with
 * backoff; the LAST failure parks the row and counts against the endpoint,
 * which is disabled after enough consecutive parks — a receiver that has
 * been down for a day is not retried forever, and the organisation sees it.
 */
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { outboundFetch } from '@/lib/validation/outbound-fetch'
import { DELIVERY_HEADER, EVENT_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER, signDelivery } from './signing'

export const DELIVERY_TIMEOUT_MS = 10_000
/** Consecutive parked deliveries before the endpoint is disabled. */
export const DISABLE_AFTER_PARKED = 3

export interface DeliverDeps {
  fetch?: typeof fetch
  now?: () => Date
}

export type AttemptOutcome = { kind: 'delivered'; status: number } | { kind: 'failed'; status: number | null; reason: string } | { kind: 'skipped'; reason: string }

export async function attemptDelivery(deliveryId: string, attempt: number, isLast: boolean, deps: DeliverDeps = {}): Promise<AttemptOutcome> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    select: { id: true, event: true, payload: true, status: true, endpoint: { select: { id: true, url: true, signingKey: true, disabledAt: true, failures: true } } },
  })
  if (!delivery) return { kind: 'skipped', reason: 'no such delivery' }
  if (delivery.status === 'DELIVERED') return { kind: 'skipped', reason: 'already delivered' }
  if (delivery.endpoint.disabledAt) {
    await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: 'PARKED', lastError: 'endpoint disabled' } })
    return { kind: 'skipped', reason: 'endpoint disabled' }
  }

  const body = JSON.stringify(delivery.payload)
  const timestamp = String(Math.floor((deps.now ?? (() => new Date()))().getTime() / 1000))
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'kleym-webhooks/1',
    [EVENT_HEADER]: delivery.event,
    [DELIVERY_HEADER]: delivery.id,
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: signDelivery(delivery.endpoint.signingKey, timestamp, body),
  }

  let status: number | null = null
  let reason: string | null = null
  try {
    const response = await outboundFetch(delivery.endpoint.url, {
      method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    }, deps.fetch ?? fetch)
    status = response.status
    if (response.ok) {
      await prisma.$transaction([
        prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: 'DELIVERED', attempts: attempt, lastStatus: status, lastError: null, deliveredAt: new Date() } }),
        prisma.webhookEndpoint.update({ where: { id: delivery.endpoint.id }, data: { failures: 0 } }),
      ])
      return { kind: 'delivered', status }
    }
    reason = `HTTP ${status}`
  } catch (error) {
    reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'destination or transport failure'
  }

  if (isLast) {
    const failures = delivery.endpoint.failures + 1
    await prisma.$transaction([
      prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: 'PARKED', attempts: attempt, lastStatus: status, lastError: reason } }),
      prisma.webhookEndpoint.update({
        where: { id: delivery.endpoint.id },
        data: { failures, ...(failures >= DISABLE_AFTER_PARKED ? { disabledAt: new Date() } : {}) },
      }),
    ])
    logger.warn({ deliveryId, endpointId: delivery.endpoint.id, attempt, status, reason, disabled: failures >= DISABLE_AFTER_PARKED }, 'webhook delivery parked')
  } else {
    await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: 'FAILED', attempts: attempt, lastStatus: status, lastError: reason } })
  }
  return { kind: 'failed', status, reason: reason ?? 'unknown' }
}
