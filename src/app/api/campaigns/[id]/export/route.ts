/**
 * POST /api/campaigns/[id]/export — record that the CSV was downloaded.
 *
 * Returns NOTHING but a timestamp. The CSV is built entirely in the browser
 * from seeds that never leave it (SPEC.md §2.2) — this endpoint exists only to
 * set the gate that lets a campaign leave CREATING (§4.1.2).
 *
 * The server cannot verify the download happened; it records the client's
 * assertion. That is acceptable because the consequence of lying falls on the
 * sender alone: without the CSV their own funds are stranded until expiry.
 */
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { requireUser, owned } from '@/lib/api/session-guard'
import { conflict, notFound, serverError } from '@/lib/api/problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OPERATOR')
  if (!user) return response
  const { id } = await params

  try {
    const campaign = await prisma.campaign.findFirst({
      where: owned(id, org.id),
      select: { id: true, csvExportedAt: true, _count: { select: { links: true } } },
    })
    if (!campaign) return notFound()

    // Marking an export before any keys exist would satisfy the gate without
    // there being anything to export.
    if (campaign._count.links === 0) {
      return conflict('No links have been registered for this campaign yet.')
    }

    if (campaign.csvExportedAt) {
      // Idempotent by nature: re-exporting is fine and keeps the first time.
      return Response.json({ csvExportedAt: campaign.csvExportedAt })
    }

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { csvExportedAt: new Date() },
      select: { csvExportedAt: true },
    })

    logger.info({ userId: user.id, campaignId: id }, 'csv export recorded')
    return Response.json(updated)
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'export mark failed')
    return serverError()
  }
}
