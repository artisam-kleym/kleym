/**
 * GET /api/v1/campaigns — list the key owner's campaigns. SPEC.md §6.6.
 *
 * There is no POST here, and there will not be one in v1: creating a campaign
 * means generating keypairs, which happens in the sender's browser and must
 * never reach a server (AGENT.md §1). CI enforces the absence.
 */
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { listQuerySchema, zodErrors } from '@/lib/api/campaigns'
import {
  amount,
  apiServerError,
  apiValidationProblem,
  jsonWithHeaders,
  requireApiCaller,
} from '@/lib/api/v1'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireApiCaller(request)
  if (!auth.caller) return auth.response

  const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return apiValidationProblem(zodErrors(parsed.error))
  const { status, page, perPage } = parsed.data

  try {
    const where = { userId: auth.caller.userId, ...(status ? { status } : {}) }
    const [total, campaigns] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        // Tie-broken for the reason given in the links route: an unstable sort
        // under LIMIT/OFFSET drops and duplicates rows across pages.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true, name: true, network: true, assetCode: true, assetIssuer: true,
          amountPerLink: true, linkCount: true, expiresAt: true, status: true, createdAt: true,
        },
      }),
    ])

    return jsonWithHeaders(
      {
        campaigns: campaigns.map((c) => ({ ...c, amountPerLink: amount(c.amountPerLink) })),
        page,
        perPage,
        total,
      },
      auth.headers,
    )
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'v1 campaign list failed')
    return apiServerError()
  }
}
