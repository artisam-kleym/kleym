/**
 * GET  /api/org/webhooks — the organisation's endpoints (any member).
 * POST /api/org/webhooks — add one (Owner). The signing key is in THIS
 * response and nowhere afterwards.
 */
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser } from '@/lib/api/session-guard'
import { serverError, validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'
import { logger } from '@/lib/config/logger'
import { createEndpoint, createEndpointSchema, listEndpoints } from '@/lib/webhooks/manage'
import { WEBHOOK_EVENTS } from '@/lib/webhooks/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { org, response } = await requireUser()
  if (!org) return response
  const endpoints = await listEndpoints(org.id)
  return Response.json({ endpoints: endpoints.map((e) => ({ ...e, parked: e._count.deliveries, _count: undefined })), events: WEBHOOK_EVENTS })
}

export async function POST(request: Request) {
  const { user, org, response } = await requireUser('OWNER')
  if (!user) return response
  const body = await request.json().catch(() => null)
  const parsed = createEndpointSchema.safeParse(body)
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))
  try {
    const { endpoint, signingKey } = await createEndpoint(user.id, org, parsed.data, clientIp(request))
    return Response.json({ endpoint, signingKey }, { status: 201 })
  } catch (error) {
    logger.error({ userId: user.id, organizationId: org.id, reason: error instanceof Error ? error.message : 'unknown' }, 'webhook add failed')
    return serverError()
  }
}
