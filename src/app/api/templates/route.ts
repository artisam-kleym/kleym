/**
 * GET  /api/templates — the organisation's campaign templates (#82).
 * POST /api/templates — save one: terms, recipient list, cadence. Operator+.
 */
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { requireUser } from '@/lib/api/session-guard'
import { conflict, serverError, validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'
import { createTemplate, listTemplates, templateSchema } from '@/lib/api/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { user, org, response } = await requireUser()
  if (!user) return response
  const templates = await listTemplates(org.id)
  return Response.json({ templates: templates.map(({ recipientsCsv, ...t }) => ({ ...t, recipients: recipientsCsv.trim() === '' ? 0 : recipientsCsv.trim().split(/\r?\n/).length - 1 })) })
}

export async function POST(request: Request) {
  const { user, org, response } = await requireUser('OPERATOR')
  if (!user) return response
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return validationProblem([{ path: '', message: 'malformed JSON' }])
  }
  const ip = clientIp(request)
  const blocked = guardRequestBody(body, { route: '/api/templates', ip })
  if (blocked) return blocked.response
  const parsed = templateSchema.safeParse(body)
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))
  try {
    const outcome = await createTemplate({ userId: user.id, org, ip }, parsed.data, env.MAX_LINKS_PER_CAMPAIGN)
    if (outcome.kind === 'invalid') return conflict(outcome.detail)
    if (outcome.kind === 'not-found') return conflict('That template could not be found.')
    return Response.json(outcome.value, { status: 201 })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'template create failed')
    return serverError()
  }
}
