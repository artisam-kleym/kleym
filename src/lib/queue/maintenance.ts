/**
 * The scheduled maintenance queues. SPEC.md §7.1.
 *
 * `reconcile` every 5 minutes, `expiry-sweep` hourly. Producer side only — the
 * consumers live in src/workers so a slow Horizon sweep never runs inside a
 * request.
 */
import { Queue } from 'bullmq'
import { QUEUE, queueConnection } from './connection'
import { RECONCILE_EVERY_MINUTES, RETENTION_CRON, WATCH_EVERY_MINUTES, everyMinutes } from './schedule'

/**
 * A fixed job id per schedule.
 *
 * BullMQ deduplicates on it, so a worker restarting — or two worker replicas —
 * cannot leave two repeatable schedules running. Two concurrent reconciles are
 * safe (the job is idempotent) but they double Horizon's load for nothing.
 */
// The ids are fixed names, NOT derived from the cadence: BullMQ deduplicates
// on them, so an id that changed with the schedule would leave the old
// scheduler running beside the new one.
const RECONCILE_SCHEDULE = 'reconcile-every-5m'
const EXPIRY_SCHEDULE = 'expiry-sweep-hourly'
const EPHEMERAL_SCHEDULE = 'ephemeral-watch-every-15m'
const RETENTION_SCHEDULE = 'delivery-retention-daily'

let reconcileQueue: Queue | undefined
let expiryQueue: Queue | undefined
let ephemeralQueue: Queue | undefined

export function reconcileJobs(): Queue {
  return (reconcileQueue ??= new Queue(QUEUE.reconcile, {
    connection: queueConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 86_400, count: 200 },
      removeOnFail: { age: 7 * 86_400 },
    },
  }))
}

export function expiryJobs(): Queue {
  return (expiryQueue ??= new Queue(QUEUE.expirySweep, {
    connection: queueConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { age: 7 * 86_400, count: 200 },
      removeOnFail: { age: 7 * 86_400 },
    },
  }))
}

export function ephemeralWatchJobs(): Queue {
  return (ephemeralQueue ??= new Queue(QUEUE.ephemeralWatch, {
    connection: queueConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { age: 86_400, count: 200 },
      removeOnFail: { age: 7 * 86_400 },
    },
  }))
}

let retentionQueue: Queue | undefined

export function retentionJobs(): Queue {
  return (retentionQueue ??= new Queue(QUEUE.deliveryRetention, {
    connection: queueConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { age: 7 * 86_400, count: 200 },
      removeOnFail: { age: 7 * 86_400 },
    },
  }))
}

/** Installs every schedule. Safe to call on every worker start. */
export async function scheduleMaintenance(): Promise<void> {
  await reconcileJobs().upsertJobScheduler(RECONCILE_SCHEDULE, { pattern: everyMinutes(RECONCILE_EVERY_MINUTES) })
  await expiryJobs().upsertJobScheduler(EXPIRY_SCHEDULE, { pattern: '17 * * * *' })
  await ephemeralWatchJobs().upsertJobScheduler(EPHEMERAL_SCHEDULE, { pattern: everyMinutes(WATCH_EVERY_MINUTES) })
  await retentionJobs().upsertJobScheduler(RETENTION_SCHEDULE, { pattern: RETENTION_CRON })
}

/**
 * Queues a reconcile now — the manual trigger on /admin/reconciliation.
 *
 * Goes through the QUEUE rather than running inline, so the admin request
 * returns immediately and the work happens on the worker with the same
 * concurrency and retry behaviour as the cron. Acceptance criterion 7 asks for
 * the same code path, and this is the same path rather than a second one that
 * looks like it.
 */
export async function requestReconcile(campaignId?: string): Promise<void> {
  await reconcileJobs().add(
    QUEUE.reconcile,
    { campaignId, manual: true },
    /*
     * Deduplicated on the scope being reconciled.
     *
     * A sweep is one serial Horizon read per ACTIVE link, so a full run is
     * minutes, not seconds. Without this, an admin clicking "Resync now"
     * twenty times during a slow run queues twenty full sweeps, which the
     * worker then runs one after another — turning a button into a way to
     * point the whole link table at Horizon over and over. The key is held
     * only while a job is waiting or running, so a click after the run
     * finishes still starts a fresh one.
     */
    { deduplication: { id: `reconcile:${campaignId ?? 'all'}` } },
  )
}
