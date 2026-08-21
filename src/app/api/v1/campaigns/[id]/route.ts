/**
 * GET /api/v1/campaigns/[id] — detail and claim stats. SPEC.md §6.6.
 */
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { owned } from '@/lib/api/session-guard'
import { amount, apiNotFound, apiServerError, jsonWithHeaders, requireApiCaller } from '@/lib/api/v1'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const auth = await requireApiCaller(request)
  if (!auth.caller) return auth.response
  const { id } = await params

  try {
    // Ownership is IN the query, never a fetch-then-compare (AGENT.md §5.4).
    const campaign = await prisma.campaign.findFirst({
      where: owned(id, auth.caller.userId),
      select: {
        id: true, name: true, network: true, assetCode: true, assetIssuer: true,
        amountPerLink: true, linkCount: true, expiresAt: true, status: true,
        reserveEstimate: true, csvExportedAt: true, createdAt: true,
      },
    })
    if (!campaign) return apiNotFound()

    const counts = await prisma.claimLink.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: true,
    })
    const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<string, number>
    const registered = counts.reduce((n, c) => n + c._count, 0)

    return jsonWithHeaders(
      {
        ...campaign,
        amountPerLink: amount(campaign.amountPerLink),
        reserveEstimate: campaign.reserveEstimate === null ? null : amount(campaign.reserveEstimate),
        stats: {
          registered,
          active: byStatus.ACTIVE ?? 0,
          claimed: byStatus.CLAIMED ?? 0,
          expired: byStatus.EXPIRED ?? 0,
          reclaimed: byStatus.RECLAIMED ?? 0,
          failed: byStatus.FAILED ?? 0,
          pending: byStatus.PENDING ?? 0,
        },
      },
      auth.headers,
    )
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'v1 campaign detail failed')
    return apiServerError()
  }
}
