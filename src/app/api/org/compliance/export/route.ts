/**
 * GET /api/org/compliance/export?from&to&format — an Owner's signed regulator
 * export of their OWN organisation's distributions (#52). Scoped by the
 * session's organisation, never by a parameter. Same headers as the audit
 * export, so the same verifier reads both.
 */
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser } from '@/lib/api/session-guard'
import { exportQuerySchema } from '@/lib/api/audit-export-route'
import { buildRegulatorExport, regulatorRows } from '@/lib/api/regulator-export'
import { recordAudit } from '@/lib/api/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { user, org, response } = await requireUser('OWNER')
  if (!user) return response
  const parsed = exportQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return new Response(null, { status: 400 })
  const { from, to, format } = parsed.data
  const rows = await regulatorRows({ organizationId: org.id, from, to })
  const out = buildRegulatorExport(rows, { organizationId: org.id, organizationName: org.name, from, to }, format)
  // An export is a disclosure of the whole organisation's book; it is audited as one.
  await recordAudit({
    userId: user.id, organizationId: org.id, action: 'org.regulator_export', entityType: 'organization', entityId: org.id,
    metadata: { format, rows: rows.length, from: from?.toISOString() ?? null, to: to?.toISOString() ?? null }, ip: clientIp(request),
  })
  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(new Uint8Array(out.body), {
    headers: {
      'content-type': out.contentType,
      'content-disposition': `attachment; filename="kleym-regulator-${org.id}-${stamp}.${format}"`,
      'x-kleym-signature': out.signature,
      'x-kleym-signing-key': out.publicKey,
      'x-kleym-signature-alg': 'ed25519-over-body-bytes',
      'cache-control': 'no-store',
    },
  })
}
