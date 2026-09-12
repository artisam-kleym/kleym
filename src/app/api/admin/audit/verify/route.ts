/** GET /api/admin/audit/verify — recompute the whole chain and name the first broken link. */
import { requireAdmin } from '@/lib/api/admin'
import { verifyChain } from '@/lib/api/audit-chain'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { user, response } = await requireAdmin()
  if (!user) return response
  const result = await verifyChain()
  return Response.json(
    {
      ...result,
      firstSeq: result.firstSeq === null ? null : String(result.firstSeq),
      lastSeq: result.lastSeq === null ? null : String(result.lastSeq),
      broken: result.broken ? { seq: String(result.broken.seq), reason: result.broken.reason } : null,
    },
    { status: result.ok ? 200 : 409, headers: { 'cache-control': 'no-store' } },
  )
}
