/**
 * POST /api/org/switch — act in another of the caller's organisations.
 *
 * The choice is remembered on the session; membership is re-checked on
 * every later request, so a membership removed after switching still ends
 * access immediately.
 */
import { logger } from '@/lib/config/logger'
import { getSessionUser, setActiveOrganization } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { notFound, serverError, unauthenticated, validationProblem } from '@/lib/api/problems'
import { switchSchema } from '@/lib/api/organizations'
import { zodErrors } from '@/lib/api/campaigns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return unauthenticated()
  const parsed = switchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))

  try {
    // A membership, or nothing: an organisation the caller is not in answers
    // the same 404 as one that does not exist.
    const membership = await prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: parsed.data.organizationId, userId: user.id } },
      select: { role: true, organization: { select: { id: true, name: true } } },
    })
    if (!membership) return notFound()
    await setActiveOrganization(user.sessionId, membership.organization.id)
    return Response.json({ organization: membership.organization, role: membership.role })
  } catch (error) {
    logger.error({ userId: user.id, reason: error instanceof Error ? error.message : 'unknown' }, 'org switch failed')
    return serverError()
  }
}
