/**
 * What the last scheduled pass of each bounded maintenance job did — so a
 * pass that stopped short is visible on /admin/reconciliation, not only in a
 * log line that scrolls away. Issue #43.
 *
 * Redis, alongside the pass cursor and for the same reason: this is the
 * jobs' own scratch state, one small value per job, overwritten each run.
 * Kept for a week so a job that has silently stopped running shows as stale
 * rather than as absent.
 */
import { recordReconcilePass } from '@/lib/observability/metrics'
import { redis } from '@/lib/redis/client'
import { logger } from '@/lib/config/logger'

export type PassJob = 'reconcile' | 'ephemeral-watch' | 'delivery-retention' | 'reminders'

export interface PassReport {
  job: PassJob
  finishedAt: string
  /** Candidates this pass read. */
  checked: number
  /** Candidates it did not reach before hitting the limit. */
  remaining: number
  limit: number
  /** Milliseconds between scheduled runs, so the page can say "stale". */
  intervalMs: number
}

const KEY = (job: PassJob) => `pass:last:${job}`
const TTL_SECONDS = 7 * 24 * 60 * 60

/** Where a pass sends its report. Injectable so a script measuring a pass need not open Redis. */
export type PassReportSink = (report: PassReport) => Promise<void>

/** For scripts: a sink that keeps the last report in memory and opens nothing. */
export function memoryPassReportSink(): PassReportSink & { last: PassReport | null } {
  const sink = Object.assign(
    async (report: PassReport) => {
      sink.last = report
    },
    { last: null as PassReport | null },
  )
  return sink
}

/** Never throws: a report that fails to write must not fail the pass it describes. */
export const recordPassReport: PassReportSink = async (report) => {
  // The metric first: a pass that cannot reach Redis still counts as one (#53).
  recordReconcilePass(report.job, report.remaining)
  try {
    await redis.set(KEY(report.job), JSON.stringify(report), 'EX', TTL_SECONDS)
  } catch (error) {
    logger.warn({ job: report.job, reason: error instanceof Error ? error.message : 'unknown' }, 'could not record pass report')
  }
}

export async function lastPassReports(): Promise<Partial<Record<PassJob, PassReport>>> {
  const jobs: PassJob[] = ['reconcile', 'ephemeral-watch', 'delivery-retention', 'reminders']
  const out: Partial<Record<PassJob, PassReport>> = {}
  try {
    const values = await redis.mget(jobs.map(KEY))
    jobs.forEach((job, i) => {
      const value = values[i]
      if (value) out[job] = JSON.parse(value) as PassReport
    })
  } catch (error) {
    logger.warn({ reason: error instanceof Error ? error.message : 'unknown' }, 'could not read pass reports')
  }
  return out
}
