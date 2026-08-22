/**
 * GET   /api/campaigns/[id] — detail with aggregate counts
 * PATCH /api/campaigns/[id] — rename, or cancel a draft
 */
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { recordAudit } from '@/lib/api/audit'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { requireUser, owned } from '@/lib/api/session-guard'
import { conflict, notFound, serverError, validationProblem } from '@/lib/api/problems'
import { patchCampaignSchema, serialiseAmount, zodErrors } from '@/lib/api/campaigns'

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
      select: {
        id: true, name: true, network: true, senderPublicKey: true, assetCode: true,
        assetIssuer: true, amountPerLink: true, linkCount: true, expiresAt: true,
        status: true, csvExportedAt: true, reserveEstimate: true, createdAt: true,
      },
    })
    if (!campaign) return notFound()

    // Aggregate counts come from a groupBy rather than N queries.
    const byStatus = await prisma.claimLink.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: { _all: true },
    })

    return Response.json({
      ...campaign,
      amountPerLink: serialiseAmount(campaign.amountPerLink),
      reserveEstimate: campaign.reserveEstimate === null ? null : serialiseAmount(campaign.reserveEstimate),
      counts: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
    })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'campaign detail failed')
    return serverError()
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser()
  if (!user) return response
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return validationProblem([{ path: '', message: 'malformed JSON' }])
  }

  const blocked = guardRequestBody(body, { route: '/api/campaigns/[id]', ip: clientIp(request) })
  if (blocked) return blocked.response

  const parsed = patchCampaignSchema.safeParse(body)
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))

  try {
    const campaign = await prisma.campaign.findFirst({
      where: owned(id, user.id),
      select: { id: true, status: true },
    })
    if (!campaign) return notFound()

    /*
     * Only a DRAFT may be cancelled here. Past that point the campaign has
     * on-chain claimable balances, and "cancel" would have to mean reclaim —
     * a signed transaction, not a status change (#13).
     */
    if (parsed.data.status === 'CANCELLED' && campaign.status !== 'DRAFT') {
      return conflict(
        `Only a draft can be cancelled. This campaign is ${campaign.status}; ` +
          'funds already on-chain are recovered by reclaiming after expiry.',
      )
    }

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      },
      select: { id: true, name: true, status: true },
    })

    /*
     * Only a CANCEL is audited, not every rename.
     *
     * SPEC.md §5.4 lists `campaign.cancel`. Auditing renames too would bury
     * the cancellations — the rows someone actually goes looking for — under
     * routine edits.
     */
    if (parsed.data.status === 'CANCELLED') {
      await recordAudit({
        userId: user.id,
        action: 'campaign.cancel',
        entityType: 'campaign',
        entityId: id,
        metadata: { previousStatus: campaign.status },
        ip: clientIp(request),
      })
    }

    logger.info({ userId: user.id, campaignId: id }, 'campaign updated')
    return Response.json(updated)
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'campaign patch failed')
    return serverError()
  }
}
