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
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import {
  createSession,
  getSessionUser,
  revokeOtherSessions,
  revokeSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/auth/session'
import { invalidCredentials, invalidRequest, serverError, unauthenticated } from '@/lib/auth/problems'

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
    const oldToken = store.get(SESSION_COOKIE)?.value

    // Rotate this session, then revoke everything else. Order matters: revoking
    // first would briefly leave the caller with no valid session at all.
    const { token, expiresAt } = await createSession(user.id, {
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: request.headers.get('user-agent'),
    })
    store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))

    if (oldToken) await revokeSession(oldToken)
    const revoked = await revokeOtherSessions(user.id, token)

    logger.info({ userId: user.id, revokedSessions: revoked }, 'password changed')
    return Response.json({ ok: true, revokedSessions: revoked })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'password change errored')
    return serverError()
  }
}
