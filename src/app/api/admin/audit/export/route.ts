/** GET /api/admin/audit/export?organizationId&from&to&format — signed export for staff. */
import { requireAdmin } from '@/lib/api/admin'
import { exportResponse } from '@/lib/api/audit-export-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { user, response } = await requireAdmin()
  if (!user) return response
  const params = Object.fromEntries(new URL(request.url).searchParams)
  if (!params.organizationId) return new Response(null, { status: 400 })
  return exportResponse(params.organizationId, params)
}
