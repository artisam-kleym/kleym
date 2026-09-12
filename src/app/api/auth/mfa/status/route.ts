/** GET /api/auth/mfa/status — the caller's factors, session state and step-up freshness (#47). */
import { requireSessionIn } from '@/lib/auth/mfa/routes'
import { factorsOf } from '@/lib/auth/mfa/factors'
import { stepUpState } from '@/lib/auth/mfa/step-up'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, response } = await requireSessionIn(['ok', 'mfa-pending', 'enrol-required'])
  if (!session) return response
  const [factors, stepUp] = await Promise.all([factorsOf(session.user.id), stepUpState(session.user.id, session.user.sessionId)])
  return Response.json({
    state: session.state,
    enrolled: session.enrolled,
    stepUp,
    totp: factors.totp ? { confirmedAt: factors.totp.confirmedAt.toISOString() } : null,
    passkeys: factors.passkeys.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), lastUsedAt: p.lastUsedAt?.toISOString() ?? null })),
    recoveryCodesLeft: factors.recoveryCodesLeft,
  }, { headers: { 'cache-control': 'no-store' } })
}
