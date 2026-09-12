/**
 * GET  /api/v1/campaigns — list the key owner's campaigns. SPEC.md §6.6.
 * POST /api/v1/campaigns — create a draft (#51).
 *
 * The POST takes the campaign's TERMS and the sender's PUBLIC key. Keypairs
 * for the links are generated on the caller's machine by the SDK and
 * registered as public keys at /links; a seed in this body — or any v1
 * write body — is refused before validation as a SEED_SUBMITTED security
 * event, and CI checks every write route runs that guard (AGENT.md §1).
 */
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { createCampaign, createCampaignSchema, listQuerySchema, zodErrors } from '@/lib/api/campaigns'
import {
  amount,
  apiServerError,
  apiValidationProblem,
  jsonWithHeaders,
  requireApiCaller,
  requireApiWriter,
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
    const where = { organizationId: auth.caller.organizationId, ...(status ? { status } : {}) }
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

export async function POST(request: Request) {
  const auth = await requireApiWriter(request, '/api/v1/campaigns')
  if (!auth.caller) return auth.response
  // requireApiWriter already ran this; repeated here so the guard is visible
  // in every write route and CI can see it is.
  const blocked = guardRequestBody(auth.body, { route: '/api/v1/campaigns', ip: clientIp(request) })
  if (blocked) return blocked.response

  const parsed = createCampaignSchema.safeParse(auth.body)
  if (!parsed.success) return apiValidationProblem(zodErrors(parsed.error))

  try {
    const campaign = await createCampaign({ userId: auth.caller.userId, organizationId: auth.caller.organizationId }, parsed.data, clientIp(request))
    logger.info({ keyId: auth.caller.keyId, campaignId: campaign.id }, 'v1 campaign created')
    return jsonWithHeaders({ ...campaign, amountPerLink: amount(campaign.amountPerLink) }, auth.headers, 201)
  } catch (error) {
    logger.error({ keyId: auth.caller.keyId, reason: error instanceof Error ? error.message : 'unknown' }, 'v1 campaign create failed')
    return apiServerError()
  }
}
