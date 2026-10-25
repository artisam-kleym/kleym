/**
 * BullMQ connection settings. SPEC.md §7.1.
 *
 * BullMQ needs its own ioredis options — `maxRetriesPerRequest: null` — because
 * blocking commands (BRPOPLPUSH) legitimately sit open for minutes and the
 * request-retry limit the app client uses would abort them. Sharing
 * lib/redis/client.ts would break workers; sharing the URL is the right amount
 * of sharing.
 *
 * Lazy, for the reason in lib/db/client.ts: route handlers are evaluated during
 * `next build`, which must not require an environment.
 */
import type { ConnectionOptions } from 'bullmq'
import { env } from '@/lib/config/env'

export function queueConnection(): ConnectionOptions {
  return {
    url: env.REDIS_URL,
    maxRetriesPerRequest: null,
  }
}

/** Queue names, in one place so a worker and a producer cannot disagree. */
export const QUEUE = {
  batchConfirm: 'batch-confirm',
  emailDeliver: 'email-deliver',
  emailStatus: 'email-status',
  reconcile: 'reconcile',
  expirySweep: 'expiry-sweep',
  ephemeralWatch: 'ephemeral-watch',
  deliveryRetention: 'delivery-retention',
  reminders: 'reminders',
  templates: 'templates',
  valuations: 'valuations',
} as const
