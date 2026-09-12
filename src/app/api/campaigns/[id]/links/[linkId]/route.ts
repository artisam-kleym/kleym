/**
 * PATCH /api/campaigns/[id]/links/[linkId] — LABEL ONLY.
 *
 * Nothing else about a link is editable here. Status, balance ID and claimant
 * come from the ledger via reconciliation (SPEC.md §3.5) — the database is a
 * cache, and letting a client write those would make it authoritative about
 * whether money moved.
 */
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { requireUser, owned } from '@/lib/api/session-guard'
import { notFound, serverError, validationProblem } from '@/lib/api/problems'
import { patchLinkSchema, zodErrors } from '@/lib/api/campaigns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; linkId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OPERATOR')
  if (!user) return response
  const { id, linkId } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return validationProblem([{ path: '', message: 'malformed JSON' }])
  }

  const blocked = guardRequestBody(body, {
    route: '/api/campaigns/[id]/links/[linkId]',
    ip: clientIp(request),
  })
  if (blocked) return blocked.response

  const parsed = patchLinkSchema.safeParse(body)
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))

  try {
    // Ownership travels through the campaign: a link is only addressable by
    // the user who owns the campaign it belongs to.
    const campaign = await prisma.campaign.findFirst({ where: owned(id, org.id), select: { id: true } })
    if (!campaign) return notFound()

    const updated = await prisma.claimLink.updateMany({
      where: { id: linkId, campaignId: id },
      data: { label: parsed.data.label },
    })
    if (updated.count === 0) return notFound()

    logger.info({ userId: user.id, campaignId: id, linkId }, 'link label updated')
    return Response.json({ id: linkId, label: parsed.data.label })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'link patch failed')
    return serverError()
  }
}
