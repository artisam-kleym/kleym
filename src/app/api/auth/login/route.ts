/**
 * POST /api/auth/login — SPEC.md §6.2.
 *
 * Every failure path returns the SAME response and spends comparable time.
 * The ordering below is deliberate: the work happens before the decision, so
 * an unknown username costs what a real one does.
 */
import { z } from 'zod'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { verifyPassword, verifyDummyPassword } from '@/lib/auth/password'
import { createSession, resolveSessionByToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session'
import { rateLimit, LOGIN_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { isLockedOut, recordFailure, clearFailures } from '@/lib/auth/lockout'
import { invalidCredentials, invalidRequest, serverError, tooManyAttempts } from '@/lib/auth/problems'
import { clientIp } from '@/lib/auth/client-ip'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(512) }).strict()

export async function POST(request: Request) {
  const ip = clientIp(request)

  try {
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return invalidRequest(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
    }
    const { username, password } = parsed.data

    const limit = await rateLimit(`login:${ip}`, LOGIN_RATE_LIMIT.limit, LOGIN_RATE_LIMIT.windowSeconds)
    if (!limit.allowed) {
      logger.warn({ securityEvent: 'LOGIN_RATE_LIMITED', ip }, 'login rate limited')
      return tooManyAttempts(limit.retryAfterSeconds)
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, passwordHash: true, isActive: true, lockedUntil: true },
    })

    // No such user: still burn an argon2 verification, then fail identically.
    if (!user) {
      await verifyDummyPassword(password)
      logger.warn({ securityEvent: 'LOGIN_FAILED', ip, reason: 'unknown_user' }, 'login failed')
      return invalidCredentials()
    }

    // Verify BEFORE checking lockout or activation. Short-circuiting here would
    // make a locked or disabled account answer faster than a live one.
    const passwordOk = await verifyPassword(user.passwordHash, password)

    if (isLockedOut(user)) {
      logger.warn({ securityEvent: 'LOGIN_BLOCKED', ip, reason: 'locked_out' }, 'login blocked')
      return invalidCredentials()
    }

    if (!user.isActive) {
      logger.warn({ securityEvent: 'LOGIN_BLOCKED', ip, reason: 'inactive' }, 'login blocked')
      return invalidCredentials()
    }

    if (!passwordOk) {
      await recordFailure(user.id)
      logger.warn({ securityEvent: 'LOGIN_FAILED', ip, reason: 'bad_password' }, 'login failed')
      return invalidCredentials()
    }

    await clearFailures(user.id)

    // A fresh session ID on every login — never reuse one across a login
    // boundary (AGENT.md §5.1, session fixation).
    const { token, expiresAt } = await createSession(user.id, {
      ip,
      userAgent: request.headers.get('user-agent'),
    })

    const store = await cookies()
    store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))

    // MFA (#47): the session exists but unlocks nothing until the factor is
    // presented, or — under a policy the user does not yet meet — enrolled.
    const resolved = await resolveSessionByToken(token)
    const next = resolved?.state === 'mfa-pending' ? 'mfa' : resolved?.state === 'enrol-required' ? 'enrol' : null
    logger.info({ userId: user.id, ip, mfa: next ?? 'none' }, 'login succeeded')
    return Response.json({ ok: true, next })
  } catch (error) {
    // Never let a password or a token reach a log line via an error object.
    logger.error({ ip, reason: error instanceof Error ? error.message : 'unknown' }, 'login errored')
    return serverError()
  }
}
