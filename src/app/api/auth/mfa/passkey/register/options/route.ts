/** POST /api/auth/mfa/passkey/register/options — a registration challenge for this session (#47). */
import { requireSessionIn } from '@/lib/auth/mfa/routes'
import { passkeyRegistrationOptions } from '@/lib/auth/mfa/passkeys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const { session, response } = await requireSessionIn(['ok', 'enrol-required'])
  if (!session) return response
  return Response.json(await passkeyRegistrationOptions(session.user, session.user.sessionId), { headers: { 'cache-control': 'no-store' } })
}
