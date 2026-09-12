/**
 * POST /api/campaigns/[id]/reclaim/submit — submit a signed reclaim.
 *
 * SPEC.md §3.4. The envelope is re-checked against a fresh ledger query before
 * submission: a recipient claiming their link while the sender was signing is
 * ordinary, and one stale operation would void every refund in the batch.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { requireUser } from '@/lib/api/session-guard'
import {
  beginIdempotency,
  releaseIdempotency,
  storeIdempotentResult,
} from '@/lib/api/idempotency'
import { conflict, notFound, serverError, validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'
import { reclaimSubmitSchema, submitReclaim } from '@/lib/api/reclaim'

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

  // Seed scan first — this endpoint takes a signed envelope back from a
  // wallet, the one place a client could plausibly return something it should
  // not. SPEC.md §6.3, AGENT.md §5.4.
  const blocked = guardRequestBody(body, {
    route: '/api/campaigns/[id]/reclaim/submit',
    ip: clientIp(request),
  })
  if (blocked) return blocked.response

  const parsed = reclaimSubmitSchema.safeParse(body)
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))

  const context = { userId: user.id, route: `/api/campaigns/${id}/reclaim/submit`, body }
  const idempotency = await beginIdempotency(request, context)
  if (!idempotency.reserved) return idempotency.response

  try {
    const outcome = await submitReclaim(id, user.id, parsed.data)
    if (outcome.kind !== 'ok') {
      await releaseIdempotency(request, context)
      return outcome.kind === 'not-found' ? notFound() : conflict(outcome.detail, outcome.reason)
    }

    const payload = outcome.value
    await storeIdempotentResult(request, context, { status: 200, body: payload })

    logger.info(
      { userId: user.id, campaignId: id, hash: payload.transactionHash, balances: payload.balanceCount },
      'reclaim submitted',
    )
    return Response.json(payload)
  } catch (error) {
    await releaseIdempotency(request, context)
    logger.error(
      { userId: user.id, campaignId: id, reason: error instanceof Error ? error.message : 'unknown' },
      'reclaim submit failed',
    )
    return serverError()
  }
}
