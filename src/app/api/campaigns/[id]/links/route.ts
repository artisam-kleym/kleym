/**
 * POST /api/campaigns/[id]/links — register ephemeral PUBLIC keys
 * GET  /api/campaigns/[id]/links — paginated link rows
 *
 * SPEC.md §6.3. This is the endpoint the non-custodial guarantee runs through:
 * the browser keeps every seed and sends only the public halves.
 */
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { requireUser, owned } from '@/lib/api/session-guard'
import {
  beginIdempotency,
  releaseIdempotency,
  storeIdempotentResult,
} from '@/lib/api/idempotency'
import { conflict, notFound, serverError, validationProblem } from '@/lib/api/problems'
import { registerLinks, isWriteConflict } from '@/lib/api/links'
import { listQuerySchema, registerLinksSchema, zodErrors } from '@/lib/api/campaigns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const { user, response } = await requireUser()
  if (!user) return response
  const { id } = await params

  const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))
  const { page, perPage } = parsed.data

  try {
    const campaign = await prisma.campaign.findFirst({ where: owned(id, user.id), select: { id: true } })
    if (!campaign) return notFound()

    const [total, links] = await Promise.all([
      prisma.claimLink.count({ where: { campaignId: id } }),
      prisma.claimLink.findMany({
        where: { campaignId: id },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true, ephemeralPublicKey: true, balanceId: true, status: true,
          label: true, claimedBy: true, claimedAt: true, claimTxHash: true,
        },
      }),
    ])

    return Response.json({ links, page, perPage, total })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'link list failed')
    return serverError()
  }
}

export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser()
  if (!user) return response
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return validationProblem([{ path: '', message: 'malformed JSON' }])
  }

  /*
   * The seed scan runs FIRST — before idempotency, before Zod.
   *
   * `.strict()` rejects unknown keys, but a seed in one would already have
   * reached the server and been discarded silently, with no security event.
   * Nothing in Kleym should ever post a seed; this exists so that if a future
   * refactor does, it fails loudly (SPEC.md §6.3).
   */
  const blocked = guardRequestBody(body, {
    route: '/api/campaigns/[id]/links',
    ip: clientIp(request),
  })
  if (blocked) return blocked.response

  const parsed = registerLinksSchema.safeParse(body)
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))

  // Reserved after validation — see the note in /api/campaigns.
  const context = { userId: user.id, route: `/api/campaigns/${id}/links`, body }
  const idempotency = await beginIdempotency(request, context)
  if (!idempotency.reserved) return idempotency.response

  try {
    const outcome = await registerLinks(id, user.id, parsed.data.publicKeys, parsed.data.labels)

    if (outcome.kind !== 'ok') {
      await releaseIdempotency(request, context)
      if (outcome.kind === 'not-found') return notFound()
      if (outcome.kind === 'bad-status') {
        return conflict(
          `Links can only be registered while a campaign is DRAFT or CREATING; this one is ${outcome.status}.`,
        )
      }
      return conflict(
        `This campaign declares ${outcome.declared} links; registering ${outcome.adding} more would make ${outcome.wouldTotal}.`,
      )
    }

    const payload = { registered: outcome.registered, total: outcome.total }
    await storeIdempotentResult(request, context, { status: 201, body: payload })

    logger.info({ userId: user.id, campaignId: id, registered: outcome.registered }, 'links registered')
    return Response.json(payload, { status: 201 })
  } catch (error) {
    await releaseIdempotency(request, context)

    // The loser of a genuine race, not a fault: the client should simply retry.
    if (isWriteConflict(error)) {
      return conflict('Another registration for this campaign was in flight. Retry.')
    }

    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'link registration failed')
    return serverError()
  }
}
