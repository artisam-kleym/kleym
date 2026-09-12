/**
 * POST /api/auth/mfa/verify { code, purpose } — a TOTP or recovery code (#47).
 *
 * `purpose: 'login'` unlocks a pending session; `'step-up'` refreshes a
 * signed-in one for the actions that move money. Bounded by the factor's own
 * attempt counter and lockout, and by an IP limit in front of it.
 */
import { z } from 'zod'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { tooManyAttempts } from '@/lib/auth/problems'
import { validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'
import { checkCode } from '@/lib/auth/mfa/factors'
import { markMfaVerified, markStepUp } from '@/lib/auth/mfa/step-up'
import { MFA_VERIFY_RATE_LIMIT, requireSessionIn } from '@/lib/auth/mfa/routes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ code: z.string().trim().min(6).max(20), purpose: z.enum(['login', 'step-up']).default('login') }).strict()

export async function POST(request: Request) {
  const ip = clientIp(request)
  const limit = await rateLimit(`mfa:verify:${ip}`, MFA_VERIFY_RATE_LIMIT.limit, MFA_VERIFY_RATE_LIMIT.windowSeconds)
  if (!limit.allowed) return tooManyAttempts(limit.retryAfterSeconds)

  const { session, response } = await requireSessionIn(['ok', 'mfa-pending'])
  if (!session) return response
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))

  const result = await checkCode(session.user.id, parsed.data.code, ip)
  if (!result.ok) {
    return Response.json({ ok: false, reason: result.reason, attemptsLeft: result.attemptsLeft }, { status: result.reason === 'locked' ? 423 : 401 })
  }
  if (parsed.data.purpose === 'login' || session.state === 'mfa-pending') await markMfaVerified(session.user.id, session.user.sessionId, result.via, ip)
  else await markStepUp(session.user.id, session.user.sessionId, result.via, ip)
  return Response.json({ ok: true, via: result.via })
}
