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

// A "*\/N * * * *" cron pattern; N must divide 60 for the gaps to be even.
export function everyMinutes(minutes: number): string {
  if (60 % minutes !== 0) throw new Error(`a ${minutes}-minute cadence does not divide the hour evenly`)
  return `*/${minutes} * * * *`
}
