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

interface ReconcileJob {
  campaignId?: string
  manual?: boolean
}

export function startReconcileWorker(): Worker<ReconcileJob> {
  const worker = new Worker<ReconcileJob>(
    QUEUE.reconcile,
    async (job: Job<ReconcileJob>) => {
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
      if (report.linksExpired > 0 || report.campaignsExpired > 0) {
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
