/**
 * GET /api/auth/sso/callback?code&state — the IdP's answer (#46).
 *
 * The code is exchanged and the ID token verified server-side; what comes
 * out is claims. The session set here is Kleym's own opaque token — no IdP
 * token is in the cookie, the database or the log.
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { createSession, getSessionUser, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session'
import { recordAudit } from '@/lib/api/audit'
import { asRoleSource, connectionById } from '@/lib/auth/sso/connections'
import { completeAuthorization } from '@/lib/auth/sso/oidc'
import { linkIdentity, resolveIdentity } from '@/lib/auth/sso/accounts'
import { asOidc } from '@/lib/auth/sso/connections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function back(request: Request, path: string): Response {
  return NextResponse.redirect(new URL(path, request.url), 302)
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) return back(request, '/login/sso?error=idp')
  const ip = clientIp(request)

  const result = await completeAuthorization(async (id) => {
    const row = await connectionById(id)
    return row ? asOidc(row) : null
  }, { code, state })
  if (!result.ok) {
    logger.warn({ ip, reason: result.reason }, 'sso: callback refused')
    return back(request, '/login/sso?error=idp')
  }
  const connection = await connectionById(result.flow.connectionId)
  if (!connection) return back(request, '/login/sso?error=idp')

  if (result.flow.purpose === 'link') {
    const user = await getSessionUser()
    if (!user || user.id !== result.flow.userId) return back(request, '/login')
    const linked = await linkIdentity(user.id, asRoleSource(connection), result.claims, ip)
    return back(request, linked.kind === 'ok' ? '/settings?sso=linked' : '/settings?sso=taken')
  }

  const outcome = await resolveIdentity(asRoleSource(connection), result.claims, ip)
  if (outcome.kind === 'link-required') return back(request, '/login/sso?error=link-required')
  if (outcome.kind === 'inactive') return back(request, '/login/sso?error=inactive')

  const { token, expiresAt } = await createSession(outcome.userId, { ip, userAgent: request.headers.get('user-agent') })
  const store = await cookies()
  store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
  await recordAudit({ userId: outcome.userId, organizationId: connection.organizationId, action: 'sso.login', entityType: 'user', entityId: outcome.userId, metadata: { provisioned: outcome.provisioned }, ip })
  logger.info({ userId: outcome.userId, organizationId: connection.organizationId, ip, provisioned: outcome.provisioned }, 'sso: login succeeded')
  return back(request, '/dashboard')
}
