/**
 * POST /api/campaigns/[id]/links/[linkId]/suspend — one link, same honesty.
 *
 * Issue #72, the wrong-recipient case. Kleym stops serving this one link;
 * its balance is unchanged and claimable by its holder until the campaign
 * expires, when the reclaim (which covers every unclaimed balance) comes due.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser } from '@/lib/api/session-guard'
import { conflict, notFound, serverError } from '@/lib/api/problems'
import { suspendLink } from '@/lib/api/suspend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; linkId: string }> }

export async function POST(request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OPERATOR')
  if (!user) return response
  const { id, linkId } = await params

  try {
    const outcome = await suspendLink(id, linkId, org.id, { userId: user.id, ip: clientIp(request) })
    if (outcome.kind === 'not-found') return notFound()
    if (outcome.kind === 'conflict') return conflict(outcome.detail, outcome.reason)

    const { value } = outcome
    return Response.json({
      id: value.linkId,
      suspendedAt: value.suspendedAt.toISOString(),
      reclaimScheduledFor: value.expiresAt.toISOString(),
      amount: value.amount,
      assetCode: value.assetCode,
      stillClaimable: true,
      already: value.already,
    })
  } catch (error) {
    logger.error({ userId: user.id, campaignId: id, linkId, reason: error instanceof Error ? error.message : 'unknown' }, 'link suspend failed')
    return serverError()
  }
}
