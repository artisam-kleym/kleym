/**
 * GET  /api/v1/campaigns/[id]/links — link statuses. SPEC.md §6.6.
 * POST /api/v1/campaigns/[id]/links — register PUBLIC keys (#51).
 *
 * `ephemeralPublicKey` is a PUBLIC key and safe to return; the private half
 * exists only in the sender's browser and their CSV (AGENT.md §1). No claim
 * URL and no fragment is exposed here — those carry the secret.
 */
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { owned } from '@/lib/api/session-guard'
import { listQuerySchema, registerLinksSchema, zodErrors } from '@/lib/api/campaigns'
import { LINK_ORDER } from '@/lib/api/link-order'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { isWriteConflict, registerLinks } from '@/lib/api/links'
import {
  apiConflict,
  apiNotFound,
  apiServerError,
  apiValidationProblem,
  jsonWithHeaders,
  requireApiCaller,
  requireApiWriter,
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
      where: owned(id, auth.caller.organizationId),
      select: { id: true },
    })
    if (!campaign) return apiNotFound()

    const [total, links] = await Promise.all([
      prisma.claimLink.count({ where: { campaignId: id } }),
      prisma.claimLink.findMany({
        where: { campaignId: id },
        // The one order links are listed in. See lib/api/link-order.ts for why
        // `createdAt` alone is not one.
        orderBy: LINK_ORDER,
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

export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiWriter(request, '/api/v1/campaigns/[id]/links')
  if (!auth.caller) return auth.response
  const { id } = await params
  const blocked = guardRequestBody(auth.body, { route: '/api/v1/campaigns/[id]/links', ip: clientIp(request) })
  if (blocked) return blocked.response

  const parsed = registerLinksSchema.safeParse(auth.body)
  if (!parsed.success) return apiValidationProblem(zodErrors(parsed.error))

  try {
    const outcome = await registerLinks(id, auth.caller.organizationId, parsed.data.publicKeys, parsed.data.labels, parsed.data.attestations)
    if (outcome.kind === 'not-found') return apiNotFound()
    if (outcome.kind === 'bad-status') return apiConflict(`Links can only be registered while a campaign is DRAFT or CREATING; this one is ${outcome.status}.`)
    if (outcome.kind === 'over-limit') return apiConflict(`This campaign declares ${outcome.declared} links; registering ${outcome.adding} more would make ${outcome.wouldTotal}.`)
    return jsonWithHeaders({ registered: outcome.registered, total: outcome.total }, auth.headers, 201)
  } catch (error) {
    if (isWriteConflict(error)) return apiConflict('Another registration for this campaign is in progress; retry.')
    logger.error({ keyId: auth.caller.keyId, reason: error instanceof Error ? error.message : 'unknown' }, 'v1 link registration failed')
    return apiServerError()
  }
}
