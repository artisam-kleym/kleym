/** POST /api/auth/mfa/passkey/register { response, name } — verify the attestation and keep the public key (#47). */
import { z } from 'zod'
import { clientIp } from '@/lib/auth/client-ip'
import { requireSessionIn } from '@/lib/auth/mfa/routes'
import { passkeyRegister } from '@/lib/auth/mfa/passkeys'
import { markMfaVerified } from '@/lib/auth/mfa/step-up'
import { validationProblem } from '@/lib/api/problems'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ response: z.object({ id: z.string() }).passthrough(), name: z.string().trim().max(60).default('Passkey') }).strict()

export async function POST(request: Request) {
  const { session, response } = await requireSessionIn(['ok', 'enrol-required'])
  if (!session) return response
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationProblem([{ path: 'response', message: 'a WebAuthn registration response' }])
  const ip = clientIp(request)
  const outcome = await passkeyRegister(session.user, session.user.sessionId, parsed.data.response as unknown as RegistrationResponseJSON, parsed.data.name, ip)
  if (!outcome.ok) return Response.json({ ok: false, reason: outcome.reason }, { status: 400 })
  await markMfaVerified(session.user.id, session.user.sessionId, 'passkey', ip)
  return Response.json({ ok: true, id: outcome.id })
}
