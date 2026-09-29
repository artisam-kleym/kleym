/**
 * GET /api/v1/templates — the caller's organisation's templates (#82), so a
 * payroll system can find the one to push a recipient list into.
 */
import { requireApiCaller, jsonWithHeaders } from '@/lib/api/v1'
import { listTemplates } from '@/lib/api/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireApiCaller(request)
  if (!auth.caller) return auth.response
  const templates = await listTemplates(auth.caller.organizationId)
  return jsonWithHeaders(
    { templates: templates.map((t) => ({ id: t.id, name: t.name, enabled: t.enabled, cadence: t.cadence, runHour: t.runHour, nextRunAt: t.nextRunAt, lastRunAt: t.lastRunAt, terms: t.terms })) },
    auth.headers,
  )
}
