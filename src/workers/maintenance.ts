/**
 * The `reconcile` and `expiry-sweep` consumers. SPEC.md §7.1, §7.2.
 *
 * Both call the same functions the admin trigger does, so there is one
 * implementation of "what reconciliation means" rather than two that drift.
 */
import { Worker, type Job } from 'bullmq'
import { logger } from '@/lib/config/logger'
import { QUEUE, queueConnection } from '@/lib/queue/connection'
import { reconcileAll, reconcileCampaign, sweepExpired } from '@/lib/api/reconcile'
import { watchEphemerals } from '@/lib/api/stranded'
import { sweepDeliveryRetention } from '@/lib/api/privacy'
import { sendReminders } from '@/lib/api/reminders'
import { runDueTemplates } from '@/lib/api/templates'
import { env } from '@/lib/config/env'
import { revalueUnpriced } from '@/lib/api/valuations'
import { retainAudit } from '@/lib/api/audit-chain'
import { recoverSubmittedFunding } from '@/lib/queue/batch-confirm'

interface ReconcileJob {
  campaignId?: string
  manual?: boolean
}

export function startReconcileWorker(): Worker<ReconcileJob> {
  const worker = new Worker<ReconcileJob>(
    QUEUE.reconcile,
    async (job: Job<ReconcileJob>) => {
      await recoverSubmittedFunding(job.data.campaignId)
      const report = job.data.campaignId
        ? await reconcileCampaign(job.data.campaignId)
        : await reconcileAll()

      /*
       * Logged at WARN when anything was corrected or is unresolved, INFO when
       * clean. A run that changes nothing is the normal case and should not
       * fill the log — §10.13 asks that a second run add no noise.
       */
      const level = report.critical > 0 ? 'error' : report.corrected + report.unresolved > 0 ? 'warn' : 'info'
      logger[level]({ ...report, manual: job.data.manual === true }, 'reconciliation completed')
      return report
    },
    // ONE at a time. Two concurrent runs over the same campaign are safe — the
    // job is idempotent — but they double Horizon's load to no purpose.
    { connection: queueConnection(), concurrency: 1 },
  )

  worker.on('failed', (job, error) => {
    logger.warn({ attempt: job?.attemptsMade, reason: error.message }, 'reconcile attempt failed')
  })

  return worker
}

export function startExpiryWorker(): Worker {
  const worker = new Worker(
    QUEUE.expirySweep,
    async () => {
      const report = await sweepExpired()
      if (report.linksExpired > 0 || report.campaignsExpired > 0 || report.reclaimsDue > 0) {
        logger.info(report, 'expiry sweep completed')
      }
      return report
    },
    { connection: queueConnection(), concurrency: 1 },
  )

  worker.on('failed', (job, error) => {
    logger.warn({ attempt: job?.attemptsMade, reason: error.message }, 'expiry sweep attempt failed')
  })

  return worker
}

/**
 * `ephemeral-watch` — the stranded account monitor. SPEC.md §7.3.
 *
 * Concurrency 1. The sweep is one ledger read per unfinished claim, and two
 * copies racing would double Horizon's load to reach the same answer.
 */
export function startEphemeralWatchWorker(): Worker {
  const worker = new Worker(
    QUEUE.ephemeralWatch,
    async () => {
      const report = await watchEphemerals()
      if (report.critical > 0) {
        logger.error(
          { critical: report.critical },
          'partially-applied claims found: ephemeral accounts holding a balance',
        )
      }
      return report
    },
    { connection: queueConnection(), concurrency: 1 },
  )

  worker.on('failed', (job, error) => {
    logger.warn(
      { attempt: job?.attemptsMade, reason: error.message },
      'ephemeral watch attempt failed',
    )
  })

  return worker
}

/** The hourly reminder pass (#78): bounded, one email per due delivery, none with a URL. */
export function startReminderWorker(): Worker {
  const worker = new Worker(
    QUEUE.reminders,
    async () => {
      const report = await sendReminders()
      if (report.reminded > 0 || report.throttled > 0 || report.remaining > 0 || report.expiringSoon > 0) {
        logger.info(report, 'reminder pass completed')
      }
      return report
    },
    { connection: queueConnection(), concurrency: 1 },
  )
  worker.on('failed', (job, error) => {
    logger.warn({ attempt: job?.attemptsMade, reason: error.message }, 'reminder pass attempt failed')
  })
  return worker
}

/** The hourly valuation pass (#80): rows no source could price at settle time are tried again against the same instant. */
export function startValuationWorker(): Worker {
  const worker = new Worker(
    QUEUE.valuations,
    async () => {
      const report = await revalueUnpriced()
      if (report.checked > 0) logger.info(report, 'valuation pass completed')
      return report
    },
    { connection: queueConnection(), concurrency: 1 },
  )
  worker.on('failed', (job, error) => {
    logger.warn({ attempt: job?.attemptsMade, reason: error.message }, 'valuation pass attempt failed')
  })
  return worker
}

/** The hourly template pass (#82): due schedules prepare a DRAFT campaign each and tell the operator. Nothing is signed. */
export function startTemplateWorker(): Worker {
  const worker = new Worker(
    QUEUE.templates,
    async () => {
      const report = await runDueTemplates(new Date(), env.MAX_LINKS_PER_CAMPAIGN)
      if (report.checked > 0) logger.info(report, 'template pass completed')
      return report
    },
    { connection: queueConnection(), concurrency: 1 },
  )
  worker.on('failed', (job, error) => {
    logger.warn({ attempt: job?.attemptsMade, reason: error.message }, 'template pass attempt failed')
  })
  return worker
}

/** The daily delivery retention sweep (#50). */
export function startRetentionWorker(): Worker {
  const worker = new Worker(
    QUEUE.deliveryRetention,
    async () => {
      const deliveries = await sweepDeliveryRetention()
      // Audit retention rides the same daily schedule (#49); its checkpoint
      // row is the audit of the deletion.
      const audit = await retainAudit()
      return { deliveries, audit: { ...audit, fromSeq: audit.fromSeq?.toString() ?? null, toSeq: audit.toSeq?.toString() ?? null } }
    },
    { connection: queueConnection(), concurrency: 1 },
  )
  worker.on('failed', (job, error) => {
    logger.warn({ attempt: job?.attemptsMade, reason: error.message }, 'delivery retention attempt failed')
  })
  return worker
}
