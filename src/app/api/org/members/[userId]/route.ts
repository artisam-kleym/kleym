/**
 * PATCH  /api/org/members/[userId] — change a member's role (Owner).
 * DELETE /api/org/members/[userId] — remove a member (Owner).
 *
 * Both refuse to leave the organisation without an owner.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser } from '@/lib/api/session-guard'
import { conflict, notFound, serverError, validationProblem } from '@/lib/api/problems'
import { changeRole, changeRoleSchema, removeMember } from '@/lib/api/organizations'
import { zodErrors } from '@/lib/api/campaigns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ userId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OWNER')
  if (!user) return response
  const { userId } = await params
  const parsed = changeRoleSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))
  try {
    const outcome = await changeRole(user.id, org, userId, parsed.data.role, clientIp(request))
    if (outcome.kind === 'not-found') return notFound()
    if (outcome.kind === 'conflict') return conflict(outcome.detail, 'last-owner')
    return Response.json({ username: outcome.username, role: parsed.data.role })
  } catch (error) {
    logger.error({ userId: user.id, organizationId: org.id, reason: error instanceof Error ? error.message : 'unknown' }, 'role change failed')
    return serverError()
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OWNER')
  if (!user) return response
  const { userId } = await params
  try {
    const outcome = await removeMember(user.id, org, userId, clientIp(request))
    if (outcome.kind === 'not-found') return notFound()
    if (outcome.kind === 'conflict') return conflict(outcome.detail, 'last-owner')
    return Response.json({ removed: outcome.username })
  } catch (error) {
    logger.error({ userId: user.id, organizationId: org.id, reason: error instanceof Error ? error.message : 'unknown' }, 'member remove failed')
    return serverError()
  }
}
