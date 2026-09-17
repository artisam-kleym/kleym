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
  const { user, org, response } = await requireUser()
  if (!user) return response
  const { id } = await params

  try {
    const campaign = await prisma.campaign.findFirst({
      where: owned(id, org.id),
      select: {
        id: true, name: true, network: true, senderPublicKey: true, assetCode: true,
        assetIssuer: true, amountPerLink: true, linkCount: true, expiresAt: true,
        status: true, csvExportedAt: true, reserveEstimate: true, createdAt: true,
        // Suspension (#72): an API client must be able to see it without having caught the webhook.
        suspendedAt: true, reclaimDueAt: true,
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
  const { user, org, response } = await requireUser('OPERATOR')
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
      where: owned(id, org.id),
      select: { id: true, status: true },
    })
    if (!campaign) return notFound()

    /*
     * Only a DRAFT may be cancelled here, because only a draft has nothing on
     * the ledger. Past that point the word is a lie: the balances stay
     * claimable by their holders until expiry whatever the row says. The
     * honest action is suspension (#72), and the reclaim is a signed
     * transaction after expiry, not a status change (#13).
     */
    if (parsed.data.status === 'CANCELLED' && campaign.status !== 'DRAFT') {
      return conflict(
        `Only a draft can be cancelled. This campaign is ${campaign.status} and its funds are on the ledger; ` +
          'suspend it to stop Kleym serving the links, and reclaim what is unclaimed after expiry.',
        'not-a-draft',
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
        organizationId: org.id,
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
