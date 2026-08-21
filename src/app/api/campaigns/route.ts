/**
 * GET  /api/campaigns — list, paginated, filterable by status
 * POST /api/campaigns — create a draft
 *
 * SPEC.md §6.3.
 */
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { requireUser } from '@/lib/api/session-guard'
import {
  beginIdempotency,
  releaseIdempotency,
  storeIdempotentResult,
} from '@/lib/api/idempotency'
import { serverError, validationProblem } from '@/lib/api/problems'
import {
  createCampaignSchema,
  listQuerySchema,
  serialiseAmount,
  zodErrors,
} from '@/lib/api/campaigns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { user, response } = await requireUser()
  if (!user) return response

  const parsed = listQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  )
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))
  const { status, page, perPage } = parsed.data

  try {
    const where = { userId: user.id, ...(status ? { status } : {}) }
    const [total, campaigns] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true, name: true, network: true, assetCode: true, assetIssuer: true,
          amountPerLink: true, linkCount: true, expiresAt: true, status: true,
          csvExportedAt: true, createdAt: true,
        },
      }),
    ])

    return Response.json({
      campaigns: campaigns.map((c) => ({ ...c, amountPerLink: serialiseAmount(c.amountPerLink) })),
      page,
      perPage,
      total,
    })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'campaign list failed')
    return serverError()
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireUser()
  if (!user) return response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return validationProblem([{ path: '', message: 'malformed JSON' }])
  }

  // Before Zod: a seed in an unknown key would otherwise be stripped unseen.
  const blocked = guardRequestBody(body, { route: '/api/campaigns', ip: clientIp(request) })
  if (blocked) return blocked.response

  const parsed = createCampaignSchema.safeParse(body)
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))

  /*
   * Reserved AFTER validation, deliberately.
   *
   * A reservation taken before Zod would be left behind by every malformed
   * request, and a released-on-failure reservation is a second write for an
   * outcome that never touched the database. Validation is deterministic on
   * the same body, so a genuine replay re-validates identically and still
   * reaches the stored response below.
   */
  const context = { userId: user.id, route: '/api/campaigns', body }
  const idempotency = await beginIdempotency(request, context)
  if (!idempotency.reserved) return idempotency.response

  try {
    const campaign = await prisma.campaign.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        network: parsed.data.network,
        senderPublicKey: parsed.data.senderPublicKey,
        assetCode: parsed.data.assetCode,
        assetIssuer: parsed.data.assetIssuer ?? null,
        amountPerLink: parsed.data.amountPerLink,
        linkCount: parsed.data.linkCount,
        expiresAt: new Date(parsed.data.expiresAt),
      },
      select: { id: true, name: true, status: true, amountPerLink: true, linkCount: true, createdAt: true },
    })

    const payload = { ...campaign, amountPerLink: serialiseAmount(campaign.amountPerLink) }
    await storeIdempotentResult(request, context, { status: 201, body: payload })

    logger.info({ userId: user.id, campaignId: campaign.id }, 'campaign created')
    return Response.json(payload, { status: 201 })
  } catch (error) {
    // The work did not complete, so the key must not stay claimed — otherwise
    // the client's retry is told its own failed request is still in progress.
    await releaseIdempotency(request, context)
    logger.error({ userId: user.id, reason: error instanceof Error ? error.message : 'unknown' }, 'campaign create failed')
    return serverError()
  }
}
