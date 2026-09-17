/**
 * POST /api/templates/[id]/run — prepare a run NOW (#82): a DRAFT campaign
 * with the template's terms and list. Nothing is funded or signed; the
 * response names the campaign to continue in the wizard.
 */
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser } from '@/lib/api/session-guard'
import { conflict, notFound, serverError } from '@/lib/api/problems'
import { loadTemplate, prepareRun } from '@/lib/api/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OPERATOR')
  if (!user) return response
  const { id } = await params
  const template = await loadTemplate(id, org.id)
  if (!template) return notFound()
  try {
    const outcome = await prepareRun(template, 'MANUAL', new Date(), env.MAX_LINKS_PER_CAMPAIGN, { userId: user.id, ip: clientIp(request) })
    if (outcome.kind === 'invalid') return conflict(outcome.detail)
    if (outcome.kind === 'not-found') return notFound()
    return Response.json(outcome.value, { status: 201 })
  } catch (error) {
    logger.error({ templateId: id, reason: error instanceof Error ? error.message : 'unknown' }, 'template run failed')
    return serverError()
  }
}
