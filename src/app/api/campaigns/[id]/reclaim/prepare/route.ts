/**
 * POST /api/campaigns/[id]/reclaim/prepare — unsigned reclaim XDR.
 *
 * SPEC.md §3.4. The operation list comes from a live Horizon query of which
 * balances still exist, never from database rows, and the call is refused
 * before `expiresAt` rather than handing the sender a transaction the network
 * will reject after they have approved it.
 */
import { logger } from '@/lib/config/logger'
import { requireUser } from '@/lib/api/session-guard'
import {
  beginIdempotency,
  releaseIdempotency,
  storeIdempotentResult,
} from '@/lib/api/idempotency'
import { conflict, notFound, serverError, validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'
import { prepareReclaim, reclaimPrepareSchema } from '@/lib/api/reclaim'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser()
  if (!user) return response
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return validationProblem([{ path: '', message: 'malformed JSON' }])
  }

  const parsed = reclaimPrepareSchema.safeParse(body)
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))

  const context = { userId: user.id, route: `/api/campaigns/${id}/reclaim/prepare`, body }
  const idempotency = await beginIdempotency(request, context)
  if (!idempotency.reserved) return idempotency.response

  try {
    const outcome = await prepareReclaim(id, user.id, parsed.data)
    if (outcome.kind !== 'ok') {
      await releaseIdempotency(request, context)
      return outcome.kind === 'not-found' ? notFound() : conflict(outcome.detail)
    }

    const payload = outcome.value
    await storeIdempotentResult(request, context, { status: 200, body: payload })

    logger.info(
      { userId: user.id, campaignId: id, sequence: payload.sequence, balances: payload.balanceCount },
      'reclaim prepared',
    )
    return Response.json(payload)
  } catch (error) {
    await releaseIdempotency(request, context)
    logger.error(
      { userId: user.id, campaignId: id, reason: error instanceof Error ? error.message : 'unknown' },
      'reclaim prepare failed',
    )
    return serverError()
  }
}
