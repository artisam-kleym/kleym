/** GET /api/org/webhooks/[id]/deliveries — the last 50 deliveries of one endpoint (any member). */
import { requireUser } from '@/lib/api/session-guard'
import { listDeliveries } from '@/lib/webhooks/manage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { org, response } = await requireUser()
  if (!org) return response
  const { id } = await params
  return Response.json({ deliveries: await listDeliveries(org.id, id) })
}
