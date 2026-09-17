/**
 * GET / PATCH / DELETE /api/templates/[id] (#82). Operator+ to change;
 * organisation-scoped in the query. Disabling stops future runs and leaves
 * past ones untouched; deleting keeps every campaign the template produced.
 */
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { requireUser } from '@/lib/api/session-guard'
import { conflict, notFound, serverError, validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'
import { deleteTemplate, loadTemplate, templatePatchSchema, updateTemplate } from '@/lib/api/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { user, org, response } = await requireUser()
  if (!user) return response
  const { id } = await params
  const template = await loadTemplate(id, org.id)
  if (!template) return notFound()
  return Response.json(template)
}

export async function PATCH(request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OPERATOR')
  if (!user) return response
  const { id } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return validationProblem([{ path: '', message: 'malformed JSON' }])
  }
  const ip = clientIp(request)
  const blocked = guardRequestBody(body, { route: '/api/templates/[id]', ip })
  if (blocked) return blocked.response
  const parsed = templatePatchSchema.safeParse(body)
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))
  try {
    const outcome = await updateTemplate({ userId: user.id, org, ip }, id, parsed.data, env.MAX_LINKS_PER_CAMPAIGN)
    if (outcome.kind === 'not-found') return notFound()
    if (outcome.kind === 'invalid') return conflict(outcome.detail)
    return Response.json(outcome.value)
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'template update failed')
    return serverError()
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OPERATOR')
  if (!user) return response
  const { id } = await params
  const outcome = await deleteTemplate({ userId: user.id, org, ip: clientIp(request) }, id)
  if (outcome.kind === 'not-found') return notFound()
  return new Response(null, { status: 204 })
}
