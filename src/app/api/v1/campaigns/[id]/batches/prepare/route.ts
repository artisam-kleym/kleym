/**
 * POST /api/v1/campaigns/[id]/batches/prepare — the unsigned envelope for
 * the next batch (#51). The caller signs it with the sender key they hold
 * and posts it to /submit. Kleym never signs for a sender.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { prepareBatch, prepareSchema } from '@/lib/api/batches'
import { zodErrors } from '@/lib/api/campaigns'
import { apiConflict, apiNotFound, apiServerError, apiValidationProblem, jsonWithHeaders, requireApiWriter } from '@/lib/api/v1'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiWriter(request, '/api/v1/campaigns/[id]/batches/prepare')
  if (!auth.caller) return auth.response
  const { id } = await params
  const blocked = guardRequestBody(auth.body, { route: '/api/v1/campaigns/[id]/batches/prepare', ip: clientIp(request) })
  if (blocked) return blocked.response

  const parsed = prepareSchema.safeParse(auth.body)
  if (!parsed.success) return apiValidationProblem(zodErrors(parsed.error))

  try {
    // The key's issuer is the signer (#45, #82), as in the wizard: recorded before the approval gate.
    const outcome = await prepareBatch(id, auth.caller.organizationId, parsed.data, auth.caller.userId)
    if (outcome.kind === 'not-found') return apiNotFound()
    if (outcome.kind === 'conflict') return apiConflict(outcome.detail)
    return jsonWithHeaders(outcome.value, auth.headers)
  } catch (error) {
    logger.error({ keyId: auth.caller.keyId, campaignId: id, reason: error instanceof Error ? error.message : 'unknown' }, 'v1 batch prepare failed')
    return apiServerError()
  }
}
