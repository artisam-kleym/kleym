/**
 * GET  /api/org — the organisation the caller is acting in, and their role.
 * PATCH /api/org — rename it, set the dual-control policy, or set the
 * screening callback URL (Owner).
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser } from '@/lib/api/session-guard'
import { serverError, validationProblem } from '@/lib/api/problems'
import { mfaPolicySchema, renameOrganization, renameSchema, setApprovalPolicy, setMfaPolicy, setScreeningUrl } from '@/lib/api/organizations'
import { policySchema } from '@/lib/api/approvals'
import { screeningUrlSchema } from '@/lib/api/screening'
import { zodErrors } from '@/lib/api/campaigns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { org, response } = await requireUser()
  if (!org) return response
  return Response.json({
    organization: { id: org.id, name: org.name, approvalThreshold: org.approvalThreshold, approvalsRequired: org.approvalsRequired, screeningUrl: org.screeningUrl, mfaPolicy: org.mfaPolicy },
    role: org.role,
  })
}

/** Rename, set the dual-control policy, or set the screening URL — one field set per call. */
export async function PATCH(request: Request) {
  const { user, org, response } = await requireUser('OWNER')
  if (!user) return response
  const body = await request.json().catch(() => null)
  const asPolicy = policySchema.safeParse(body)
  const asRename = renameSchema.safeParse(body)
  const asScreening = screeningUrlSchema.safeParse(body)
  const asMfa = mfaPolicySchema.safeParse(body)
  if (!asPolicy.success && !asRename.success && !asScreening.success && !asMfa.success) {
    const shape = body && typeof body === 'object' && 'screeningUrl' in body ? asScreening.error : asRename.error
    return validationProblem(zodErrors(shape))
  }
  try {
    if (asMfa.success) {
      await setMfaPolicy(user.id, org, asMfa.data.mfaPolicy, clientIp(request))
      return Response.json({ organization: { id: org.id, name: org.name, mfaPolicy: asMfa.data.mfaPolicy } })
    }
    if (asScreening.success) {
      await setScreeningUrl(user.id, org, asScreening.data.screeningUrl, clientIp(request))
      return Response.json({ organization: { id: org.id, name: org.name, screeningUrl: asScreening.data.screeningUrl } })
    }
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
