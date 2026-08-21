/**
 * POST /api/campaigns/[id]/batches/retry — re-open failed batches.
 *
 * SPEC.md §3.2. Failed batches go back to PENDING with their links attached,
 * so the next prepare builds a transaction containing only those links. The
 * batches that succeeded are on-chain and are not touched.
 */
import { logger } from '@/lib/config/logger'
import { requireUser } from '@/lib/api/session-guard'
import { beginIdempotency, releaseIdempotency, storeIdempotentResult } from '@/lib/api/idempotency'
import { conflict, notFound, serverError } from '@/lib/api/problems'
import { retryFailedBatches } from '@/lib/api/batches'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser()
  if (!user) return response
  const { id } = await params

  const context = { userId: user.id, route: `/api/campaigns/${id}/batches/retry`, body: null }
  const idempotency = await beginIdempotency(request, context)
  if (!idempotency.reserved) return idempotency.response

  try {
    const outcome = await retryFailedBatches(id, user.id)
    if (outcome.kind !== 'ok') {
      await releaseIdempotency(request, context)
      return outcome.kind === 'not-found' ? notFound() : conflict(outcome.detail)
    }

    const payload = outcome.value
    await storeIdempotentResult(request, context, { status: 200, body: payload })

    logger.info({ userId: user.id, campaignId: id, retried: payload.retried }, 'failed batches re-opened')
    return Response.json(payload)
  } catch (error) {
    await releaseIdempotency(request, context)
    logger.error(
      { userId: user.id, campaignId: id, reason: error instanceof Error ? error.message : 'unknown' },
      'batch retry failed',
    )
    return serverError()
  }
}
