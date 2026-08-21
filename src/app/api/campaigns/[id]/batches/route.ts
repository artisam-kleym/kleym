/**
 * GET /api/campaigns/[id]/batches — signing progress.
 *
 * What "Batch 3 / 12 signed" is rendered from (SPEC.md §3.2). No XDR and no
 * balance IDs — this is a status view, and the batch endpoints are where the
 * on-chain surface lives.
 */
import { logger } from '@/lib/config/logger'
import { prisma } from '@/lib/db/client'
import { requireUser, owned } from '@/lib/api/session-guard'
import { notFound, serverError } from '@/lib/api/problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { user, response } = await requireUser()
  if (!user) return response
  const { id } = await params

  try {
    const campaign = await prisma.campaign.findFirst({
      where: owned(id, user.id),
      select: { id: true, status: true, linkCount: true },
    })
    if (!campaign) return notFound()

    const batches = await prisma.batch.findMany({
      where: { campaignId: id },
      orderBy: { sequence: 'asc' },
      select: {
        sequence: true, status: true, transactionHash: true, errorCode: true,
        submittedAt: true, confirmedAt: true, _count: { select: { links: true } },
      },
    })

    return Response.json({
      campaignStatus: campaign.status,
      total: batches.length,
      confirmed: batches.filter((b) => b.status === 'CONFIRMED').length,
      failed: batches.filter((b) => b.status === 'FAILED').length,
      batches: batches.map(({ _count, ...batch }) => ({ ...batch, linkCount: _count.links })),
    })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'batch list failed')
    return serverError()
  }
}
