/**
 * GET /api/org/receipts?from&to&format — every signed receipt of the
 * session's organisation in a claim-date range (#81). Scoped by the session,
 * never by a parameter; Operator and up, like the campaign views. Audited as
 * a disclosure, like the regulator export.
 */
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser } from '@/lib/api/session-guard'
import { exportQuerySchema } from '@/lib/api/audit-export-route'
import { buildReceiptBundle, receiptResponse, receiptsFor } from '@/lib/api/receipts'
import { recordAudit } from '@/lib/api/audit'
import { serverError } from '@/lib/api/problems'
import { logger } from '@/lib/config/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { user, org, response } = await requireUser('OPERATOR')
  if (!user) return response
  const parsed = exportQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return new Response(null, { status: 400 })
  const { from, to, format } = parsed.data
  try {
    const receipts = await receiptsFor({ organizationId: org.id, from, to })
    const out = buildReceiptBundle(receipts, { organizationId: org.id, organizationName: org.name, from, to }, format)
    await recordAudit({
      userId: user.id, organizationId: org.id, action: 'org.receipts_export', entityType: 'organization', entityId: org.id,
      metadata: { format, receipts: receipts.length, from: from?.toISOString() ?? null, to: to?.toISOString() ?? null }, ip: clientIp(request),
    })
    const stamp = new Date().toISOString().slice(0, 10)
    return receiptResponse(out.body, out.contentType, out.signature, out.publicKey, `kleym-receipts-${org.id}-${stamp}.${format}`)
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'organisation receipts export failed')
    return serverError()
  }
}
