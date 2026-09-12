/**
 * GET /api/auth/sso/start?handle=<org handle>[&purpose=link] — send the
 * browser to the organisation's IdP (#46). `link` requires a signed-in
 * session and binds the identity that comes back to it.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { tooManyAttempts } from '@/lib/auth/problems'
import { getSessionUser } from '@/lib/auth/session'
import { notFound, unauthenticated, validationProblem } from '@/lib/api/problems'
import { asOidc, connectionByHandle } from '@/lib/auth/sso/connections'
import { beginAuthorization } from '@/lib/auth/sso/oidc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ handle: z.string().trim().min(2).max(39), purpose: z.enum(['login', 'link']).default('login') })

export async function GET(request: Request) {
  const ip = clientIp(request)
  const limit = await rateLimit(`sso:start:${ip}`, 30, 15 * 60)
  if (!limit.allowed) return tooManyAttempts(limit.retryAfterSeconds)
  const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return validationProblem([{ path: 'handle', message: 'an organisation handle' }])
  const connection = await connectionByHandle(parsed.data.handle)
  if (!connection) return notFound()
  let userId: string | undefined
  if (parsed.data.purpose === 'link') {
    const user = await getSessionUser()
    if (!user) return unauthenticated()
    userId = user.id
  }
  try {
    const { url } = await beginAuthorization(asOidc(connection), parsed.data.purpose, userId)
    return NextResponse.redirect(url, 302)
  } catch (error) {
    logger.error({ connectionId: connection.id, reason: error instanceof Error ? error.message : 'unknown' }, 'sso: could not begin')
    return NextResponse.redirect(new URL('/login/sso?error=idp', request.url), 302)
  }
}
