/** POST /api/auth/mfa/totp/confirm { code } — prove the app, get the recovery codes ONCE (#47). */
import { z } from 'zod'
import { clientIp } from '@/lib/auth/client-ip'
import { requireSessionIn } from '@/lib/auth/mfa/routes'
import { confirmTotpEnrolment } from '@/lib/auth/mfa/factors'
import { markMfaVerified } from '@/lib/auth/mfa/step-up'
import { conflict, validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ code: z.string().trim().regex(/^\d{6}$/) }).strict()

export async function POST(request: Request) {
  const { session, response } = await requireSessionIn(['ok', 'enrol-required'])
  if (!session) return response
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))
  const ip = clientIp(request)
  const outcome = await confirmTotpEnrolment(session.user.id, parsed.data.code, ip)
  if (outcome.kind === 'none') return conflict('No enrolment in progress. Start again.')
  if (outcome.kind === 'locked') return Response.json({ ok: false, reason: 'locked' }, { status: 423 })
  if (outcome.kind === 'wrong') return Response.json({ ok: false, reason: 'wrong', attemptsLeft: outcome.attemptsLeft }, { status: 401 })
  // The session that just enrolled has presented the factor; it need not present it again now.
  await markMfaVerified(session.user.id, session.user.sessionId, 'totp', ip)
  return Response.json({ ok: true, recoveryCodes: outcome.recoveryCodes }, { headers: { 'cache-control': 'no-store' } })
}
