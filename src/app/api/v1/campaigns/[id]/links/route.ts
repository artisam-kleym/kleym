/**
 * GET /api/v1/campaigns/[id]/links — link statuses. SPEC.md §6.6.
 *
 * `ephemeralPublicKey` is a PUBLIC key and safe to return; the private half
 * exists only in the sender's browser and their CSV (AGENT.md §1). No claim
 * URL and no fragment is exposed here — those carry the secret.
 */
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { owned } from '@/lib/api/session-guard'
import { listQuerySchema, zodErrors } from '@/lib/api/campaigns'
import {
  apiNotFound,
  apiServerError,
  apiValidationProblem,
  jsonWithHeaders,
  requireApiCaller,
} from '@/lib/api/v1'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const auth = await requireApiCaller(request)
  if (!auth.caller) return auth.response
  const { id } = await params

  const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return apiValidationProblem(zodErrors(parsed.error))
  const { page, perPage } = parsed.data

  try {
    const campaign = await prisma.campaign.findFirst({
      where: owned(id, auth.caller.userId),
      select: { id: true },
    })
    if (!campaign) return apiNotFound()

    const [total, links] = await Promise.all([
      prisma.claimLink.count({ where: { campaignId: id } }),
      prisma.claimLink.findMany({
        where: { campaignId: id },
        orderBy: { createdAt: 'asc' },
        take: perPage,
        skip: (page - 1) * perPage,
        select: {
          id: true, ephemeralPublicKey: true, balanceId: true, status: true,
          label: true, claimedBy: true, claimedAt: true, claimTxHash: true,
        },
      }),
    ])

    return jsonWithHeaders({ links, page, perPage, total }, auth.headers)
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'v1 link list failed')
    return apiServerError()
  }
}
