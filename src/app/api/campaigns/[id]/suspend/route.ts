/**
 * POST /api/campaigns/[id]/suspend — stop Kleym serving this campaign's links.
 *
 * Issue #72. This is NOT a cancellation and the response does not call it
 * one: the balances stay on the ledger, claimable by anyone holding a link
 * until `expiresAt`, when the scheduled reclaim comes due. No body, no
 * Idempotency-Key — nothing here touches chain state, and the action is
 * idempotent by construction (a second call reports the first).
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser } from '@/lib/api/session-guard'
import { conflict, notFound, serverError } from '@/lib/api/problems'
import { suspendCampaign } from '@/lib/api/suspend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OPERATOR')
  if (!user) return response
  const { id } = await params

  try {
    const outcome = await suspendCampaign(id, org.id, { userId: user.id, ip: clientIp(request) })
    if (outcome.kind === 'not-found') return notFound()
    if (outcome.kind === 'conflict') return conflict(outcome.detail, outcome.reason)

    const { value } = outcome
    return Response.json({
      id,
      suspendedAt: value.suspendedAt.toISOString(),
      reclaimScheduledFor: value.expiresAt.toISOString(),
      outstanding: value.outstanding,
      outstandingAmount: value.outstandingAmount,
      assetCode: value.assetCode,
      // Stated in the product, as SPEC.md §12 requires — not only in a document.
      stillClaimable: true,
      already: value.already,
    })
  } catch (error) {
    logger.error({ userId: user.id, campaignId: id, reason: error instanceof Error ? error.message : 'unknown' }, 'campaign suspend failed')
    return serverError()
  }
}
