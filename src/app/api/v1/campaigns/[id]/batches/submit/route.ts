/**
 * POST /api/v1/campaigns/[id]/batches/submit — a batch the caller signed
 * (#51). Verified against what was prepared, submitted to Horizon, and
 * confirmed by the worker from the ledger — exactly the session route.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { prisma } from '@/lib/db/client'
import { submitBatch, submitSchema } from '@/lib/api/batches'
import { zodErrors } from '@/lib/api/campaigns'
import { enqueueBatchConfirm } from '@/lib/queue/batch-confirm'
import { apiConflict, apiNotFound, apiServerError, apiValidationProblem, jsonWithHeaders, requireApiWriter } from '@/lib/api/v1'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiWriter(request, '/api/v1/campaigns/[id]/batches/submit')
  if (!auth.caller) return auth.response
  const { id } = await params
  const blocked = guardRequestBody(auth.body, { route: '/api/v1/campaigns/[id]/batches/submit', ip: clientIp(request) })
  if (blocked) return blocked.response

  const parsed = submitSchema.safeParse(auth.body)
  if (!parsed.success) return apiValidationProblem(zodErrors(parsed.error))

  try {
    const outcome = await submitBatch(id, auth.caller.organizationId, parsed.data)
    if (outcome.kind === 'not-found') return apiNotFound()
    if (outcome.kind === 'conflict') return apiConflict(outcome.detail)

    if (!outcome.value.replay) {
      const batch = await prisma.batch.findFirst({ where: { campaignId: id, sequence: outcome.value.sequence }, select: { id: true } })
      if (batch) {
        try {
          await enqueueBatchConfirm(batch.id)
        } catch (error) {
          logger.error({ campaignId: id, sequence: outcome.value.sequence, reason: error instanceof Error ? error.message : 'unknown' }, 'batch submitted but confirmation could not be queued')
        }
      }
    }
    return jsonWithHeaders(outcome.value, auth.headers)
  } catch (error) {
    logger.error({ keyId: auth.caller.keyId, campaignId: id, reason: error instanceof Error ? error.message : 'unknown' }, 'v1 batch submit failed')
    return apiServerError()
  }
}
