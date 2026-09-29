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
import { createTemplate, listTemplates, parseRecipients, templateSchema } from '@/lib/api/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { user, org, response } = await requireUser()
  if (!user) return response
  const templates = await listTemplates(org.id)
  // Counted by the same parser the run uses: header or not, blank lines or not; 0 when the list would be refused.
  const count = (csv: string) => {
    const parsed = parseRecipients(csv, env.MAX_LINKS_PER_CAMPAIGN)
    return parsed.ok ? parsed.recipients.labels.length : 0
  }
  return Response.json({ templates: templates.map(({ recipientsCsv, ...t }) => ({ ...t, recipients: count(recipientsCsv) })) })
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
    // Terms the campaign schema would refuse come back as the validation problem the wizard would get (F2).
    if (outcome.kind === 'invalid') return outcome.errors ? validationProblem(outcome.errors) : conflict(outcome.detail)
    if (outcome.kind === 'not-found') return conflict('That template could not be found.')
    return Response.json(outcome.value, { status: 201 })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'template create failed')
    return serverError()
  }
}
