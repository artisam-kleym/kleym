/** POST /api/auth/mfa/passkey/authenticate/options — an assertion challenge for this session (#47). */
import { requireSessionIn } from '@/lib/auth/mfa/routes'
import { passkeyAuthenticationOptions } from '@/lib/auth/mfa/passkeys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const { session, response } = await requireSessionIn(['ok', 'mfa-pending'])
  if (!session) return response
  return Response.json(await passkeyAuthenticationOptions(session.user.id, session.user.sessionId), { headers: { 'cache-control': 'no-store' } })
}
