/**
 * POST /api/auth/password — SPEC.md §6.2.
 *
 * Two things happen beyond changing the hash, and both are the point:
 * the session ID rotates, and every OTHER session is revoked. If someone
 * else has a session, a password change is how the owner evicts them.
 */
import { z } from 'zod'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { recordAudit } from '@/lib/api/audit'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import {
  createSession,
  getSessionUser,
  revokeOtherSessions,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/auth/session'
import { invalidCredentials, invalidRequest, serverError, tooManyAttempts, unauthenticated } from '@/lib/auth/problems'
import { rateLimit, PASSWORD_CHANGE_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { clientIp } from '@/lib/auth/client-ip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z
  .object({
    current: z.string().min(1).max(512),
    next: z.string().min(12, 'must be at least 12 characters').max(512),
  })
  .strict()

export async function POST(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return unauthenticated()

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return invalidRequest(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
    }

    /*
     * Throttled per account, not per IP. This endpoint verifies `current`, so
     * without a limit anyone holding a stolen session can brute-force the
     * existing password — and unlike /login there is no lockout behind it.
     * Keyed on the user because the session already identifies them.
     */
    const limit = await rateLimit(
      `password:${user.id}`,
      PASSWORD_CHANGE_RATE_LIMIT.limit,
      PASSWORD_CHANGE_RATE_LIMIT.windowSeconds,
    )
    if (!limit.allowed) {
      logger.warn(
        { securityEvent: 'PASSWORD_CHANGE_RATE_LIMITED', userId: user.id, ip: clientIp(request) },
        'password change rate limited',
      )
      return tooManyAttempts(limit.retryAfterSeconds)
    }

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    })
    if (!record) return unauthenticated()

    if (!(await verifyPassword(record.passwordHash, parsed.data.current))) {
      logger.warn({ securityEvent: 'PASSWORD_CHANGE_FAILED', userId: user.id }, 'wrong current password')
      return invalidCredentials()
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.next) },
    })

    const store = await cookies()

    // Rotate this session, then revoke everything else. Order matters: revoking
    // first would briefly leave the caller with no valid session at all.
    const { token, expiresAt } = await createSession(user.id, {
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    })
    store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))

    // One call, not two: revokeOtherSessions deletes every session for this
    // user except the token just issued — which includes the one the caller
    // arrived with. Revoking that separately first would only make the
    // reported count depend on the order of two operations that look
    // independent.
    const revoked = await revokeOtherSessions(user.id, token)

    await recordAudit({
      userId: user.id,
      action: 'auth.password_change',
      entityType: 'user',
      entityId: user.id,
      // The COUNT of sessions ended, never a token. AGENT.md §4.5.
      metadata: { revokedSessions: revoked },
      ip: clientIp(request),
    })
    logger.info({ userId: user.id, revokedSessions: revoked }, 'password changed')
    return Response.json({ ok: true, revokedSessions: revoked })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'password change errored')
    return serverError()
  }
}
