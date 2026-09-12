/**
 * DELETE /api/org/webhooks/[id] — remove an endpoint (Owner).
 * PATCH  /api/org/webhooks/[id] — `{ "enabled": true }` re-enables a parked one (Owner).
 */
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser } from '@/lib/api/session-guard'
import { notFound, validationProblem } from '@/lib/api/problems'
import { deleteEndpoint, enableEndpoint } from '@/lib/webhooks/manage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OWNER')
  if (!user) return response
  const { id } = await params
  if (!(await deleteEndpoint(user.id, org, id, clientIp(request)))) return notFound()
  return new Response(null, { status: 204 })
}

export async function PATCH(request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OWNER')
  if (!user) return response
  const { id } = await params
  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null
  if (body?.enabled !== true) return validationProblem([{ path: 'enabled', message: 'only { "enabled": true } is accepted' }])
  if (!(await enableEndpoint(user.id, org, id, clientIp(request)))) return notFound()
  return Response.json({ enabled: true })
}
