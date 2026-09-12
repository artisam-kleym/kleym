/**
 * Sessions. AGENT.md §5.1.
 *
 * Opaque random tokens, stored as a SHA-256 hash. NOT JWTs — this application
 * needs revocation, and a JWT cannot be revoked without the very server-side
 * lookup that JWTs exist to avoid.
 */
import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db/client'
import { env } from '@/lib/config/env'

/**
 * `__Host-` is not decoration: it forbids a Domain attribute and requires
 * Secure + Path=/, so a subdomain cannot set or overwrite this cookie.
 */
export const SESSION_COOKIE = '__Host-kleym_session'

const TOKEN_BYTES = 32

/** The token is the secret; only its hash is ever stored. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface SessionUser {
  id: string
  username: string
  role: 'ADMIN' | 'SENDER'
  /** This session's row, so the active organisation can be switched on it. */
  sessionId: string
  /** The organisation this session last chose to act in; validated per request. */
  activeOrganizationId: string | null
}

/**
 * Issues a new session. Always call this on login and on password change —
 * reusing an existing session ID across a privilege change is session fixation.
 */
export async function createSession(
  userId: string,
  context: { ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3600_000)

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    },
  })

  return { token, expiresAt }
}

/** Resolves the caller, or null. Expired rows are deleted rather than ignored. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      activeOrganizationId: true,
      user: { select: { id: true, username: true, role: true, isActive: true } },
    },
  })

  if (!session) return null

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  // AGENT.md §5.1: a deactivated user cannot authenticate. Checked on every
  // request, not only at login, so deactivation takes effect immediately
  // rather than whenever the session happens to expire.
  if (!session.user.isActive) return null

  return {
    id: session.user.id,
    username: session.user.username,
    role: session.user.role,
    sessionId: session.id,
    activeOrganizationId: session.activeOrganizationId,
  }
}

/** Remembers which organisation this session acts in. Membership is re-checked on every request regardless. */
export async function setActiveOrganization(sessionId: string, organizationId: string): Promise<void> {
  await prisma.session.update({ where: { id: sessionId }, data: { activeOrganizationId: organizationId } })
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
}

/**
 * Revokes every session for a user except the one given.
 *
 * Used on password change: the point is to evict an attacker who already has a
 * session, while leaving the person who just changed their password logged in.
 */
export async function revokeOtherSessions(userId: string, keepToken: string): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { userId, tokenHash: { not: hashToken(keepToken) } },
  })
  return result.count
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  }
}
