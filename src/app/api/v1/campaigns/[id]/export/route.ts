/**
 * POST /api/v1/campaigns/[id]/export — the caller has written the secrets
 * file (#51). Same gate as the session route: nothing leaves CREATING until
 * this is recorded, and the file itself never comes here.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { markCsvExported } from '@/lib/api/campaigns'
import { apiConflict, apiNotFound, apiServerError, jsonWithHeaders, requireApiWriter } from '@/lib/api/v1'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiWriter(request, '/api/v1/campaigns/[id]/export')
  if (!auth.caller) return auth.response
  const { id } = await params
  const blocked = guardRequestBody(auth.body, { route: '/api/v1/campaigns/[id]/export', ip: clientIp(request) })
  if (blocked) return blocked.response

  try {
    const outcome = await markCsvExported(id, auth.caller.organizationId)
    if (outcome.kind === 'not-found') return apiNotFound()
    if (outcome.kind === 'no-links') return apiConflict('No links have been registered for this campaign yet.')
    return jsonWithHeaders({ csvExportedAt: outcome.csvExportedAt.toISOString() }, auth.headers)
  } catch (error) {
    logger.error({ keyId: auth.caller.keyId, reason: error instanceof Error ? error.message : 'unknown' }, 'v1 export mark failed')
    return apiServerError()
  }
}
