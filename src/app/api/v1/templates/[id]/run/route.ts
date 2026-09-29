/**
 * POST /api/v1/templates/[id]/run — prepare a run now (#82): a DRAFT campaign
 * with the template's terms and list. It funds and signs nothing; an operator
 * finishes it in the wizard, and the CSV gate applies as ever.
 */
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { apiConflict, apiNotFound, apiServerError, jsonWithHeaders, requireApiWriter } from '@/lib/api/v1'
import { loadTemplate, prepareRun } from '@/lib/api/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiWriter(request, '/api/v1/templates/[id]/run')
  if (!auth.caller) return auth.response
  const blocked = guardRequestBody(auth.body, { route: '/api/v1/templates/[id]/run', ip: clientIp(request) })
  if (blocked) return blocked.response
  const { id } = await params
  try {
    const template = await loadTemplate(id, auth.caller.organizationId)
    if (!template) return apiNotFound()
    const outcome = await prepareRun(template, 'MANUAL', new Date(), env.MAX_LINKS_PER_CAMPAIGN, { userId: auth.caller.userId, ip: clientIp(request) })
    if (outcome.kind === 'invalid') return apiConflict(outcome.detail)
    if (outcome.kind === 'not-found') return apiNotFound()
    logger.info({ keyId: auth.caller.keyId, templateId: id, campaignId: outcome.value.campaignId }, 'v1 template run prepared')
    return jsonWithHeaders(outcome.value, auth.headers, 201)
  } catch (error) {
    logger.error({ keyId: auth.caller.keyId, reason: error instanceof Error ? error.message : 'unknown' }, 'v1 template run failed')
    return apiServerError()
  }
}
