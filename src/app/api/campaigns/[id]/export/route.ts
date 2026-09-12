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
import { logger } from '@/lib/config/logger'
import { requireUser } from '@/lib/api/session-guard'
import { markCsvExported } from '@/lib/api/campaigns'
import { conflict, notFound, serverError } from '@/lib/api/problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OPERATOR')
  if (!user) return response
  const { id } = await params

  try {
    const outcome = await markCsvExported(id, org.id)
    if (outcome.kind === 'not-found') return notFound()
    if (outcome.kind === 'no-links') return conflict('No links have been registered for this campaign yet.')
    logger.info({ userId: user.id, campaignId: id }, 'csv export recorded')
    return Response.json({ csvExportedAt: outcome.csvExportedAt })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'export mark failed')
    return serverError()
  }
}
