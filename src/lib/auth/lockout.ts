/**
 * Per-account lockout. AGENT.md §5.1 — 10 failures.
 *
 * Distinct from the IP rate limit: that one stops a burst from one source,
 * this one stops a slow distributed attack against a single account.
 */
import { prisma } from '@/lib/db/client'

export const MAX_FAILED_LOGINS = 10
const LOCKOUT_MINUTES = 30

export function isLockedOut(user: { lockedUntil: Date | null }): boolean {
  return user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now()
}

/**
 * Counts one failure and locks the account once it reaches the threshold.
 *
 * The increment is ATOMIC. Reading the counter and writing `read + 1` loses
 * concurrent failures — several requests read the same value and all store the
 * same result — and the concurrency this races on is exactly what a
 * distributed attack produces, which is the case this lockout exists for.
 *
 * Applying the lock also RESETS the counter. Leaving it at the threshold would
 * mean that once the 30 minutes elapse, a single wrong password re-locks the
 * account immediately — so anyone who knows a username could hold it locked
 * indefinitely at one request per half hour. Resetting makes the lock a
 * bounded penalty rather than a permanent state with a hair trigger.
 */
export async function recordFailure(userId: string): Promise<void> {
  const { failedLogins } = await prisma.user.update({
    where: { id: userId },
    data: { failedLogins: { increment: 1 } },
    select: { failedLogins: true },
  })

  if (failedLogins >= MAX_FAILED_LOGINS) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000),
        failedLogins: 0,
      },
    })
  }
}

export async function clearFailures(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLogins: 0, lockedUntil: null },
  })
}
