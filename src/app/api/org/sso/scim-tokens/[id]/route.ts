/** DELETE /api/org/sso/scim-tokens/[id] — revoke (Owner). Takes effect on the next request. */
import { requireUser } from '@/lib/api/session-guard'
import { notFound } from '@/lib/api/problems'
import { revokeScimToken } from '@/lib/auth/sso/scim'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OWNER')
  if (!user) return response
  const { id } = await params
  return (await revokeScimToken(org.id, id)) ? new Response(null, { status: 204 }) : notFound()
}
