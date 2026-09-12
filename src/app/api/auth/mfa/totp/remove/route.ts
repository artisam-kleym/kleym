/** POST /api/auth/mfa/totp/remove — remove the authenticator and every recovery code. Takes a fresh factor. */
import { clientIp } from '@/lib/auth/client-ip'
import { requireSessionIn } from '@/lib/auth/mfa/routes'
import { removeTotp } from '@/lib/auth/mfa/factors'
import { requireStepUp } from '@/lib/api/session-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { session, response } = await requireSessionIn(['ok'])
  if (!session) return response
  const stepUp = await requireStepUp(session.user)
  if (stepUp) return stepUp
  await removeTotp(session.user.id, clientIp(request))
  return Response.json({ ok: true })
}
