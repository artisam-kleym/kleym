/**
 * GET    /api/org/sso — the organisation's connection (any member; no secret, ever).
 * PUT    /api/org/sso — create or replace it (Owner). The client secret is sent
 *        once here and stored encrypted; omit it on a later PUT to keep it.
 * DELETE /api/org/sso — remove it (Owner). Identities and SCIM groups go with it.
 */
import { clientIp } from '@/lib/auth/client-ip'
import { requireUser } from '@/lib/api/session-guard'
import { conflict, notFound, serverError, validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'
import { logger } from '@/lib/config/logger'
import { connectionForOrg, connectionSchema, publicView, removeConnection, upsertConnection } from '@/lib/auth/sso/connections'
import { listScimTokens } from '@/lib/auth/sso/scim'
import { redirectUri } from '@/lib/auth/sso/oidc'
import { scimBase } from '@/lib/auth/sso/scim-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { org, response } = await requireUser()
  if (!org) return response
  const [connection, tokens] = await Promise.all([connectionForOrg(org.id), listScimTokens(org.id)])
  return Response.json({ connection: publicView(connection), redirectUri: redirectUri(), scimBase: scimBase(), scimTokens: tokens })
}

export async function PUT(request: Request) {
  const { user, org, response } = await requireUser('OWNER')
  if (!user) return response
  const parsed = connectionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))
  try {
    const outcome = await upsertConnection(user.id, org, parsed.data, clientIp(request))
    if (outcome.kind === 'handle-taken') return conflict('That handle belongs to another organisation.')
    if (outcome.kind === 'secret-required') return validationProblem([{ path: 'clientSecret', message: 'required when creating the connection' }])
    return Response.json({ connection: publicView(await connectionForOrg(org.id)) })
  } catch (error) {
    logger.error({ userId: user.id, organizationId: org.id, reason: error instanceof Error ? error.message : 'unknown' }, 'sso connection save failed')
    return serverError()
  }
}

export async function DELETE(request: Request) {
  const { user, org, response } = await requireUser('OWNER')
  if (!user) return response
  if (!(await removeConnection(user.id, org, clientIp(request)))) return notFound()
  return new Response(null, { status: 204 })
}
