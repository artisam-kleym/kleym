/** POST /api/auth/mfa/passkey/authenticate { response, purpose } — verify the assertion; unlock or step up (#47). */
import { z } from 'zod'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { tooManyAttempts } from '@/lib/auth/problems'
import { MFA_VERIFY_RATE_LIMIT, requireSessionIn } from '@/lib/auth/mfa/routes'
import { passkeyAuthenticate } from '@/lib/auth/mfa/passkeys'
import { markMfaVerified, markStepUp } from '@/lib/auth/mfa/step-up'
import { validationProblem } from '@/lib/api/problems'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ response: z.object({ id: z.string() }).passthrough(), purpose: z.enum(['login', 'step-up']).default('login') }).strict()

export async function POST(request: Request) {
  const ip = clientIp(request)
  const limit = await rateLimit(`mfa:verify:${ip}`, MFA_VERIFY_RATE_LIMIT.limit, MFA_VERIFY_RATE_LIMIT.windowSeconds)
  if (!limit.allowed) return tooManyAttempts(limit.retryAfterSeconds)
  const { session, response } = await requireSessionIn(['ok', 'mfa-pending'])
  if (!session) return response
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationProblem([{ path: 'response', message: 'a WebAuthn authentication response' }])
  const outcome = await passkeyAuthenticate(session.user.id, session.user.sessionId, parsed.data.response as unknown as AuthenticationResponseJSON)
  if (!outcome.ok) return Response.json({ ok: false, reason: outcome.reason }, { status: 401 })
  if (parsed.data.purpose === 'login' || session.state === 'mfa-pending') await markMfaVerified(session.user.id, session.user.sessionId, 'passkey', ip)
  else await markStepUp(session.user.id, session.user.sessionId, 'passkey', ip)
  return Response.json({ ok: true, via: 'passkey' })
}
