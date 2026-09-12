/**
 * GET  /api/settings/api-keys — list the caller's keys (never the secrets)
 * POST /api/settings/api-keys — issue one, returned in full exactly once
 *
 * SPEC.md §6.6.
 */
import { z } from 'zod'
import { logger } from '@/lib/config/logger'
import { recordAudit } from '@/lib/api/audit'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { requireUser } from '@/lib/api/session-guard'
import { serverError, validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'
import { issueApiKey, listApiKeys } from '@/lib/auth/api-key'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createSchema = z.object({ name: z.string().trim().min(1).max(60) }).strict()

export async function GET() {
  const { user, response } = await requireUser()
  if (!user) return response

  try {
    return Response.json({ keys: await listApiKeys(user.id) })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'api key list failed')
    return serverError()
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireUser()
  if (!user) return response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return validationProblem([{ path: '', message: 'malformed JSON' }])
  }

  const blocked = guardRequestBody(body, { route: '/api/settings/api-keys', ip: clientIp(request) })
  if (blocked) return blocked.response

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))

  /*
   * No Idempotency-Key, deliberately.
   *
   * AGENT.md §4.3 scopes the requirement to endpoints that touch CHAIN state.
   * Issuing a key moves no money, and storing the response would keep the one
   * value this system promises to show once and never again — the whole point
   * of the argon2 hash is that nothing can hand the key back later.
   */
  try {
    const issued = await issueApiKey(user.id, parsed.data.name)

    // The key itself is never logged (AGENT.md §4.5).
    await recordAudit({
      userId: user.id,
      action: 'apikey.create',
      entityType: 'apikey',
      entityId: issued.id,
      // The PREFIX, which is how a key is identified in the UI. Never the key.
      metadata: { prefix: issued.prefix },
      ip: clientIp(request),
    })
    logger.info({ userId: user.id, keyId: issued.id, prefix: issued.prefix }, 'api key issued')

    return Response.json(
      {
        id: issued.id,
        name: parsed.data.name,
        prefix: issued.prefix,
        key: issued.key,
        warning: 'This is the only time this key will be shown. Store it now.',
      },
      { status: 201, headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    logger.error(
      { userId: user.id, reason: error instanceof Error ? error.message : 'unknown' },
      'api key issue failed',
    )
    return serverError()
  }
}
