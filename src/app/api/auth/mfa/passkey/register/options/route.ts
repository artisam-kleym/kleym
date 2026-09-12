/** POST /api/auth/mfa/passkey/register/options — a registration challenge for this session (#47). */
import { requireSessionIn } from '@/lib/auth/mfa/routes'
import { passkeyRegistrationOptions } from '@/lib/auth/mfa/passkeys'
import { enrolmentGate } from '@/lib/auth/mfa/step-up'
import { stepUpRequired } from '@/lib/api/problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const { session, response } = await requireSessionIn(['ok', 'enrol-required'])
  if (!session) return response
  // Adding a factor to an account that has one takes a fresh step-up (see enrolmentGate).
  if ((await enrolmentGate(session.user.id, session.user.sessionId)).blocked) return stepUpRequired()
  return Response.json(await passkeyRegistrationOptions(session.user, session.user.sessionId), { headers: { 'cache-control': 'no-store' } })
}
