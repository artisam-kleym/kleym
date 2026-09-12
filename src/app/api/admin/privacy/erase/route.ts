/**
 * POST /api/admin/privacy/erase — honour an erasure request by address.
 *
 * Kleym staff only (404 for anyone else): recipients are not users and their
 * requests arrive out of band. The address goes in the body and comes back
 * as a count — it is never echoed, logged, or written to the audit row.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { requireAdmin } from '@/lib/api/admin'
import { eraseByEmail, eraseSchema } from '@/lib/api/privacy'
import { serverError, validationProblem } from '@/lib/api/problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { user, response } = await requireAdmin()
  if (!user) return response
  const parsed = eraseSchema.safeParse(await request.json().catch(() => null))
  // Field name only: a malformed address is not repeated back.
  if (!parsed.success) return validationProblem([{ path: 'email', message: 'must be an email address' }])
  try {
    const result = await eraseByEmail(user.id, parsed.data.email, clientIp(request))
    return Response.json(result, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    logger.error({ actorId: user.id, reason: error instanceof Error ? error.message : 'unknown' }, 'erasure failed')
    return serverError()
  }
}
