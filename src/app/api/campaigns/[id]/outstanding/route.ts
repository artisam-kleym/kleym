/**
 * GET /api/campaigns/[id]/outstanding — unclaimed value, from the ledger (#78).
 *
 * One Horizon stream per call, so this is fetched by the panel rather than
 * rendered into the page: a campaign list must not cost a Horizon read per row.
 */
import { logger } from '@/lib/config/logger'
import { requireUser } from '@/lib/api/session-guard'
import { notFound, serverError } from '@/lib/api/problems'
import { loadOutstanding } from '@/lib/api/outstanding'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { user, org, response } = await requireUser()
  if (!user) return response
  const { id } = await params
  try {
    const outstanding = await loadOutstanding(id, org.id)
    if (!outstanding) return notFound()
    return Response.json(outstanding, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    logger.error({ campaignId: id, reason: error instanceof Error ? error.message : 'unknown' }, 'outstanding view failed')
    return serverError()
  }
}
