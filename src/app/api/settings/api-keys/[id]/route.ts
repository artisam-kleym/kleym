/**
 * DELETE /api/settings/api-keys/[id] — revoke a key.
 *
 * Takes effect on the next request: the public API checks `revokedAt` on every
 * call rather than caching a resolution (SPEC.md §6.6).
 */
import { logger } from '@/lib/config/logger'
import { requireUser } from '@/lib/api/session-guard'
import { notFound, serverError } from '@/lib/api/problems'
import { revokeApiKey } from '@/lib/auth/api-key'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser()
  if (!user) return response
  const { id } = await params

  try {
    // Scoped by owner in the query, so another user's key id is a 404 and not
    // an authorisation decision made after the row was already read.
    const revoked = await revokeApiKey(id, user.id)
    if (!revoked) return notFound()

    logger.info({ userId: user.id, keyId: id }, 'api key revoked')
    return new Response(null, { status: 204 })
  } catch (error) {
    logger.error({ userId: user.id, reason: error instanceof Error ? error.message : 'unknown' }, 'api key revoke failed')
    return serverError()
  }
}
