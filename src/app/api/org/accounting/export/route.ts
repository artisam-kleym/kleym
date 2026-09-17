/**
 * GET /api/org/accounting/export?from&to&campaignId&format — the signed
 * journal-entry export (#80): one line per settled claim, valued at its own
 * claim date; reclaims as reversals; network fees as their own lines. Scoped
 * by the session's organisation, never by a parameter; Operator and up.
 * Byte-identical for the same range on every run — nothing is priced here.
 */
import { z } from 'zod'
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser } from '@/lib/api/session-guard'
import { recordAudit } from '@/lib/api/audit'
import { serverError, validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'
import { logger } from '@/lib/config/logger'
import { buildAccountingExport, journalLines, valuationRows } from '@/lib/api/valuations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  campaignId: z.string().min(1).max(64).optional(),
  format: z.enum(['csv', 'json']).default('csv'),
})

export async function GET(request: Request) {
  const { user, org, response } = await requireUser('OPERATOR')
  if (!user) return response
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))
  const { from, to, campaignId, format } = parsed.data
  try {
    const rows = await valuationRows({ organizationId: org.id, campaignId, from, to })
    const lines = journalLines(rows)
    const out = buildAccountingExport(lines, { organizationId: org.id, organizationName: org.name, currency: org.reportingCurrency, campaignId, from, to }, format)
    await recordAudit({
      userId: user.id, organizationId: org.id, action: 'org.accounting_export', entityType: 'organization', entityId: org.id,
      metadata: { format, lines: lines.length, unpriced: out.unpriced, campaignId: campaignId ?? null, from: from?.toISOString() ?? null, to: to?.toISOString() ?? null }, ip: clientIp(request),
    })
    const stamp = new Date().toISOString().slice(0, 10)
    return new Response(new Uint8Array(out.body), {
      headers: {
        'content-type': out.contentType,
        'content-disposition': `attachment; filename="kleym-accounting-${org.id}-${stamp}.${format}"`,
        'x-kleym-signature': out.signature,
        'x-kleym-signing-key': out.publicKey,
        'x-kleym-signature-alg': 'ed25519-over-body-bytes',
        // Outside the body on purpose: the body is the same bytes for the same range, every run.
        'x-kleym-generated-at': new Date().toISOString(),
        'x-kleym-unpriced-lines': String(out.unpriced),
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'accounting export failed')
    return serverError()
  }
}
