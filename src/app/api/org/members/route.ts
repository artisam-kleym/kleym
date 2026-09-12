/**
 * GET  /api/org/members — who is in the caller's organisation (any member).
 * POST /api/org/members — add one (Owner): an existing account joins, an
 * unknown username is invited, and the invitation URL comes back once.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser } from '@/lib/api/session-guard'
import { conflict, serverError, validationProblem } from '@/lib/api/problems'
import { addMember, addMemberSchema, listMembers } from '@/lib/api/organizations'
import { zodErrors } from '@/lib/api/campaigns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { org, response } = await requireUser()
  if (!org) return response
  return Response.json({ members: await listMembers(org.id) })
}

export async function POST(request: Request) {
  const { user, org, response } = await requireUser('OWNER')
  if (!user) return response
  const parsed = addMemberSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))
  try {
    const outcome = await addMember(user.id, org, parsed.data, clientIp(request))
    if (outcome.kind === 'conflict') return conflict(outcome.detail, 'member-conflict')
    if (outcome.kind === 'not-found') return conflict('No such user.', 'member-conflict')
    return Response.json(
      { username: outcome.username, inviteUrl: outcome.inviteUrl ?? null, expiresAt: outcome.expiresAt?.toISOString() ?? null },
      { status: 201, headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    logger.error({ userId: user.id, organizationId: org.id, reason: error instanceof Error ? error.message : 'unknown' }, 'member add failed')
    return serverError()
  }
}
