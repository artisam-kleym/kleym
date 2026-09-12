/**
 * GET  /api/campaigns/[id]/approvals — where a campaign stands (any member).
 * POST /api/campaigns/[id]/approvals — approve or reject (Approver and above,
 * never the creator). SPEC.md §5.4, issue #45.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser } from '@/lib/api/session-guard'
import { conflict, notFound, serverError, validationProblem } from '@/lib/api/problems'
import { approvalStatus, decide, decisionSchema } from '@/lib/api/approvals'
import { zodErrors } from '@/lib/api/campaigns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { org, response } = await requireUser()
  if (!org) return response
  const { id } = await params
  const status = await approvalStatus(id, org.id)
  if (!status) return notFound()
  return Response.json(status)
}

export async function POST(request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('APPROVER')
  if (!user) return response
  const { id } = await params
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))
  try {
    const outcome = await decide(user, org, id, parsed.data, clientIp(request))
    if (outcome.kind === 'not-found') return notFound()
    if (outcome.kind === 'conflict') return conflict(outcome.detail, 'approval')
    return Response.json(outcome.status)
  } catch (error) {
    logger.error({ userId: user.id, campaignId: id, reason: error instanceof Error ? error.message : 'unknown' }, 'approval decision failed')
    return serverError()
  }
}
