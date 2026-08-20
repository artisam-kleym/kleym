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

export async function recordFailure(userId: string, currentFailures: number): Promise<void> {
  const failures = currentFailures + 1
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLogins: failures,
      lockedUntil:
        failures >= MAX_FAILED_LOGINS
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
          : undefined,
    },
  })
}

export async function clearFailures(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLogins: 0, lockedUntil: null },
  })
}
