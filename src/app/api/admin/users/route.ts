/**
 * POST /api/admin/users — create an account and its invitation. SPEC.md §5.4.
 *
 * Admin only, enforced HERE (404 for anyone else — `requireAdmin`'s posture).
 * The response carries the invitation URL exactly once; it is never logged
 * and never stored in the clear.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { requireAdmin } from '@/lib/api/admin'
import { createInvitedUser, createUserSchema } from '@/lib/api/invitations'
import { conflict, serverError, validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { user, response } = await requireAdmin()
  if (!user) return response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return validationProblem([{ path: '', message: 'malformed JSON' }])
  }
  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))

  try {
    const outcome = await createInvitedUser(user.id, parsed.data, clientIp(request))
    if (outcome.kind === 'conflict') return conflict(outcome.detail, 'username-taken')

    return Response.json(
      { user: outcome.user, inviteUrl: outcome.inviteUrl, expiresAt: outcome.expiresAt.toISOString() },
      { status: 201, headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    logger.error(
      { actorId: user.id, reason: error instanceof Error ? error.message : 'unknown' },
      'user creation failed',
    )
    return serverError()
  }
}
