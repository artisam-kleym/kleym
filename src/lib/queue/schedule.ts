/**
 * The cadence of the bounded maintenance passes — the ONE place it is set.
 *
 * The cron patterns in lib/queue/maintenance.ts, the staleness rule on
 * /admin/reconciliation (lib/queue/pass-report.ts) and the load test's
 * "does a pass fit its interval" projection (scripts/load-batches.ts) all
 * derive from these two numbers, so changing a schedule cannot leave the
 * other two silently using the old one.
 */
export const RECONCILE_EVERY_MINUTES = 5
export const WATCH_EVERY_MINUTES = 15

export const RECONCILE_INTERVAL_MS = RECONCILE_EVERY_MINUTES * 60_000
export const WATCH_INTERVAL_MS = WATCH_EVERY_MINUTES * 60_000

/** Reminders (#78) are checked hourly; a point is due for a day, so an hour's granularity is plenty. */
export const REMINDER_CRON = '41 * * * *'
export const REMINDER_INTERVAL_MS = 60 * 60_000
/** Unpriced valuations (#80) are retried hourly against the same historical window; a thin pair fills in when it trades. */
export const VALUATION_CRON = '53 * * * *'
export const VALUATION_INTERVAL_MS = 60 * 60_000

/** The delivery retention sweep (#50) runs once a day, at an off-hour minute. */
export const RETENTION_CRON = '23 3 * * *'
export const RETENTION_INTERVAL_MS = 24 * 60 * 60_000

// A "*\/N * * * *" cron pattern; N must divide 60 for the gaps to be even.
export function everyMinutes(minutes: number): string {
  if (60 % minutes !== 0) throw new Error(`a ${minutes}-minute cadence does not divide the hour evenly`)
  return `*/${minutes} * * * *`
}
