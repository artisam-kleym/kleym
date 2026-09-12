/**
 * GET /api/status — the /status page's snapshot as JSON, for an external
 * status service or a probe. Public; carries no tenant data. Issue #53.
 */
import { statusSnapshot } from '@/lib/observability/status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const snapshot = await statusSnapshot()
  return Response.json(snapshot, {
    status: snapshot.overall === 'down' ? 503 : 200,
    headers: { 'cache-control': 'no-store' },
  })
}
