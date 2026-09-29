/**
 * GET /api/campaigns/[id]/receipts?format=json|csv — every signed receipt of
 * one campaign (#81): one per settled claim and no others. The bundle is
 * signed as a whole; each receipt inside carries its own signature too.
 * Operator and up, and audited as a disclosure — like the organisation route.
 */
import { z } from 'zod'
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser, owned } from '@/lib/api/session-guard'
import { recordAudit } from '@/lib/api/audit'
import { notFound, serverError, validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'
import { logger } from '@/lib/config/logger'
import { prisma } from '@/lib/db/client'
import { buildReceiptBundle, receiptResponse, receiptsFor } from '@/lib/api/receipts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const querySchema = z.object({ format: z.enum(['csv', 'json']).default('json') })

export async function GET(request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OPERATOR')
  if (!user) return response
  const { id } = await params
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))

  try {
    const campaign = await prisma.campaign.findFirst({ where: owned(id, org.id), select: { id: true } })
    if (!campaign) return notFound()
    const receipts = await receiptsFor({ organizationId: org.id, campaignId: campaign.id })
    const out = buildReceiptBundle(receipts, { organizationId: org.id, organizationName: org.name, campaignId: campaign.id }, parsed.data.format)
    await recordAudit({
      userId: user.id, organizationId: org.id, action: 'campaign.receipts_export', entityType: 'campaign', entityId: campaign.id,
      metadata: { format: parsed.data.format, receipts: receipts.length }, ip: clientIp(request),
    })
    const stamp = new Date().toISOString().slice(0, 10)
    return receiptResponse(out.body, out.contentType, out.signature, out.publicKey, `kleym-receipts-${campaign.id}-${stamp}.${parsed.data.format}`)
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'campaign receipts export failed')
    return serverError()
  }
}
