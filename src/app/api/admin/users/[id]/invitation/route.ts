/**
 * DELETE /api/admin/users/[id]/invitation — revoke a pending invitation.
 *
 * Removes the invitation and the account it was for, which has set no
 * password and owns nothing yet. Admin only, 404 for anyone else — the
 * posture of every admin route.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { requireAdmin } from '@/lib/api/admin'
import { revokeInvitation } from '@/lib/api/invitations'
import { conflict, notFound, serverError } from '@/lib/api/problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(request: Request, { params }: Params) {
  const { user, response } = await requireAdmin()
  if (!user) return response
  const { id } = await params

  try {
    const outcome = await revokeInvitation(user.id, id, clientIp(request))
    if (outcome.kind === 'not-found') return notFound()
    if (outcome.kind === 'conflict') return conflict(outcome.detail, 'already-redeemed')
    return Response.json({ revoked: outcome.username })
  } catch (error) {
    logger.error(
      { actorId: user.id, targetId: id, reason: error instanceof Error ? error.message : 'unknown' },
      'invitation revoke failed',
    )
    return serverError()
  }
}
