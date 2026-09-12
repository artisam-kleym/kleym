/**
 * POST /api/campaigns/[id]/batches/submit — submit one signed batch.
 *
 * SPEC.md §3.2, §7.1. The signed envelope is re-derived against the campaign
 * before submission (never trusted as prepared), submitted to Horizon, and
 * queued for confirmation. Links become ACTIVE only from a closed ledger.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { requireStepUp, requireUser } from '@/lib/api/session-guard'
import {
  beginIdempotency,
  releaseIdempotency,
  storeIdempotentResult,
} from '@/lib/api/idempotency'
import { conflict, notFound, serverError, validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'
import { submitBatch, submitSchema } from '@/lib/api/batches'
import { enqueueBatchConfirm } from '@/lib/queue/batch-confirm'
import { prisma } from '@/lib/db/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OPERATOR')
  if (!user) return response
  // Step-up (#47): a fresh factor, whatever the session's age — this moves money.
  const stepUp = await requireStepUp(user)
  if (stepUp) return stepUp
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return validationProblem([{ path: '', message: 'malformed JSON' }])
  }

  /*
   * The seed scan runs FIRST — before idempotency, before Zod.
   *
   * This endpoint takes a signed transaction envelope, which is the one place
   * a sender's wallet integration could plausibly hand back something it
   * should not. Nothing in Kleym posts a seed; if a future change does, it
   * fails loudly (SPEC.md §6.3, AGENT.md §5.4).
   */
  const blocked = guardRequestBody(body, {
    route: '/api/campaigns/[id]/batches/submit',
    ip: clientIp(request),
  })
  if (blocked) return blocked.response

  const parsed = submitSchema.safeParse(body)
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))

  // Reserved after validation — see the note in /api/campaigns.
  const context = { userId: user.id, route: `/api/campaigns/${id}/batches/submit`, body }
  const idempotency = await beginIdempotency(request, context)
  if (!idempotency.reserved) return idempotency.response

  try {
    const outcome = await submitBatch(id, org.id, parsed.data)

    if (outcome.kind !== 'ok') {
      await releaseIdempotency(request, context)
      return outcome.kind === 'not-found' ? notFound() : conflict(outcome.detail)
    }

    /*
     * Enqueued after the row is SUBMITTED, and a failure here is not fatal.
     *
     * The transaction is already on its way to the ledger — money has moved.
     * Refusing the response because Redis was briefly unreachable would tell
     * the sender their batch failed when it did not. Reconciliation (#12)
     * exists for exactly this drift.
     */
    if (!outcome.value.replay) {
      const batch = await prisma.batch.findFirst({
        where: { campaignId: id, sequence: outcome.value.sequence },
        select: { id: true },
      })
      if (batch) {
        try {
          await enqueueBatchConfirm(batch.id)
        } catch (error) {
          logger.error(
            { campaignId: id, sequence: outcome.value.sequence, reason: error instanceof Error ? error.message : 'unknown' },
            'batch submitted but confirmation could not be queued',
          )
        }
      }
    }

    const payload = outcome.value
    await storeIdempotentResult(request, context, { status: 202, body: payload })

    logger.info(
      { userId: user.id, campaignId: id, sequence: payload.sequence, hash: payload.transactionHash },
      'batch submitted',
    )
    return Response.json(payload, { status: 202 })
  } catch (error) {
    await releaseIdempotency(request, context)
    logger.error(
      { userId: user.id, campaignId: id, reason: error instanceof Error ? error.message : 'unknown' },
      'batch submit failed',
    )
    return serverError()
  }
}
