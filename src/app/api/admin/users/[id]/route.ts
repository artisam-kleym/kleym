/**
 * PATCH /api/admin/users/[id] — activate or deactivate a user. SPEC.md §5.4.
 *
 * Admin only, enforced HERE rather than by the layout: a route handler is
 * reachable by anyone who knows its path, whatever the navigation shows.
 */
import { z } from 'zod'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { requireAdmin, setUserActive } from '@/lib/api/admin'
import { conflict, notFound, serverError, validationProblem } from '@/lib/api/problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ isActive: z.boolean() }).strict()

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireAdmin()
  if (!user) return response
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return validationProblem([{ path: '', message: 'malformed JSON' }])
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return validationProblem([{ path: 'isActive', message: 'must be true or false' }])
  }

  try {
    const outcome = await setUserActive(user.id, id, parsed.data.isActive, clientIp(request))
    if (outcome.kind === 'not-found') return notFound()
    if (outcome.kind === 'conflict') return conflict(outcome.detail)

    return Response.json({ isActive: parsed.data.isActive, sessionsEnded: outcome.sessionsEnded })
  } catch (error) {
    logger.error(
      { actorId: user.id, targetId: id, reason: error instanceof Error ? error.message : 'unknown' },
      'user activation change failed',
    )
    return serverError()
  }
}
