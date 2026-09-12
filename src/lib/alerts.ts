/**
 * Outbound alerts. Issue #48.
 *
 * A log line at ERROR is where an alert used to end. This posts a JSON event
 * to `ALERT_WEBHOOK_URL` as well — a generic shape any receiver can consume,
 * with PagerDuty Events v2 and Slack incoming webhooks documented in
 * docs/sponsor-runbook.md. Deduplicated in Redis per (event, key) for an
 * hour, so a sponsor sitting below its threshold pages once, not once per
 * claim. Never throws: an alert that cannot be delivered must not fail the
 * claim that raised it.
 */
import { createHash } from 'node:crypto'
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'
import { redis } from '@/lib/redis/client'

export type AlertEvent = 'sponsor.low_balance' | 'sponsor.failover'

export const ALERT_DEDUPE_SECONDS = 60 * 60

export interface AlertDelivery {
  /** What happened, regardless of whether a webhook is configured. */
  event: AlertEvent
  sent: boolean
  deduplicated: boolean
}

export async function alert(event: AlertEvent, payload: Record<string, string | number | null>, options: { dedupeKey?: string; fetchImpl?: typeof fetch } = {}): Promise<AlertDelivery> {
  const key = `alert:${event}:${createHash('sha256').update(options.dedupeKey ?? JSON.stringify(payload)).digest('hex').slice(0, 16)}`
  logger.error({ alert: event, ...payload }, `alert: ${event}`)

  let deduplicated = false
  try {
    const first = await redis.set(key, '1', 'EX', ALERT_DEDUPE_SECONDS, 'NX')
    deduplicated = first === null
  } catch {
    // Redis down: deliver rather than suppress. Duplicate pages beat none.
  }
  if (deduplicated) return { event, sent: false, deduplicated }
  if (!env.ALERT_WEBHOOK_URL) return { event, sent: false, deduplicated }

  const body = JSON.stringify({ source: 'kleym', event, severity: 'critical', at: new Date().toISOString(), ...payload })
  try {
    const response = await (options.fetchImpl ?? fetch)(env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kleym-alert': event },
      body,
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) {
      logger.error({ alert: event, status: response.status }, 'alert webhook refused the event')
      return { event, sent: false, deduplicated }
    }
    return { event, sent: true, deduplicated }
  } catch (error) {
    logger.error({ alert: event, reason: error instanceof Error ? error.message : 'unknown' }, 'alert webhook unreachable')
    return { event, sent: false, deduplicated }
  }
}
