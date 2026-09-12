/**
 * GET  /api/org — the organisation the caller is acting in, and their role.
 * PATCH /api/org — rename it (Owner).
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser } from '@/lib/api/session-guard'
import { serverError, validationProblem } from '@/lib/api/problems'
import { renameOrganization, renameSchema } from '@/lib/api/organizations'
import { zodErrors } from '@/lib/api/campaigns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { org, response } = await requireUser()
  if (!org) return response
  return Response.json({ organization: { id: org.id, name: org.name }, role: org.role })
}

export async function PATCH(request: Request) {
  const { user, org, response } = await requireUser('OWNER')
  if (!user) return response
  const parsed = renameSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))
  try {
    await renameOrganization(user.id, org, parsed.data.name, clientIp(request))
    return Response.json({ organization: { id: org.id, name: parsed.data.name } })
  } catch (error) {
    logger.error({ userId: user.id, organizationId: org.id, reason: error instanceof Error ? error.message : 'unknown' }, 'org rename failed')
    return serverError()
  }
}
