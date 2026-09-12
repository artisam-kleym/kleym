/**
 * GET /api/org/audit/export?from&to&format — an Owner's signed extract of
 * their OWN organisation's audit rows. Scoped by the session's organisation,
 * never by a parameter, so an extract cannot span tenants.
 */
import { requireUser } from '@/lib/api/session-guard'
import { exportResponse } from '@/lib/api/audit-export-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { org, response } = await requireUser('OWNER')
  if (!org) return response
  return exportResponse(org.id, Object.fromEntries(new URL(request.url).searchParams))
}
