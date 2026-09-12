/**
 * GET  /api/org — the organisation the caller is acting in, and their role.
 * PATCH /api/org — rename it (Owner).
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser } from '@/lib/api/session-guard'
import { serverError, validationProblem } from '@/lib/api/problems'
import { renameOrganization, renameSchema, setApprovalPolicy } from '@/lib/api/organizations'
import { policySchema } from '@/lib/api/approvals'
import { zodErrors } from '@/lib/api/campaigns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { org, response } = await requireUser()
  if (!org) return response
  return Response.json({
    organization: { id: org.id, name: org.name, approvalThreshold: org.approvalThreshold, approvalsRequired: org.approvalsRequired },
    role: org.role,
  })
}

/** Rename, or set the dual-control policy — one field set or the other. */
export async function PATCH(request: Request) {
  const { user, org, response } = await requireUser('OWNER')
  if (!user) return response
  const body = await request.json().catch(() => null)
  const asPolicy = policySchema.safeParse(body)
  const asRename = renameSchema.safeParse(body)
  if (!asPolicy.success && !asRename.success) return validationProblem(zodErrors(asRename.error))
  try {
    if (asPolicy.success) {
      await setApprovalPolicy(user.id, org, asPolicy.data, clientIp(request))
      return Response.json({ organization: { id: org.id, name: org.name, ...asPolicy.data } })
    }
    await renameOrganization(user.id, org, asRename.data!.name, clientIp(request))
    return Response.json({ organization: { id: org.id, name: asRename.data!.name } })
  } catch (error) {
    logger.error({ userId: user.id, organizationId: org.id, reason: error instanceof Error ? error.message : 'unknown' }, 'org rename failed')
    return serverError()
  }
}
