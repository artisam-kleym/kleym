/** POST /api/auth/mfa/totp/enrol — a fresh, unconfirmed TOTP key for the authenticator app (#47). Shown once. */
import { requireSessionIn } from '@/lib/auth/mfa/routes'
import { beginTotpEnrolment } from '@/lib/auth/mfa/factors'
import { conflict } from '@/lib/api/problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const { session, response } = await requireSessionIn(['ok', 'enrol-required'])
  if (!session) return response
  const outcome = await beginTotpEnrolment(session.user.id, session.user.username)
  if (outcome.kind === 'already-enrolled') return conflict('An authenticator app is already enrolled. Remove it first.')
  return Response.json({ keyBase32: outcome.keyBase32, otpauth: outcome.otpauth }, { headers: { 'cache-control': 'no-store' } })
}
