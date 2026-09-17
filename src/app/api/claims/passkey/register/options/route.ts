/**
 * POST /api/claims/passkey/register/options — WebAuthn options for the PASSKEY policy (#79).
 * Same-origin, like everything /claim talks to; the challenge is keyed by the link.
 */
import { z } from 'zod'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { passkeyRegisterOptions } from '@/lib/api/claim-passkey'
import { RESOLVE_LIMIT, claimConflict, claimNotFound, claimRateLimited, claimServerError, claimValidationProblem } from '@/lib/api/claim-problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ ephemeralPublicKey: z.string().regex(/^G[A-Z2-7]{55}$/) }).strict()

export async function POST(request: Request) {
  const ip = clientIp(request)
  const limit = await rateLimit(`claims:passkey:${ip}`, RESOLVE_LIMIT.limit, RESOLVE_LIMIT.windowSeconds)
  if (!limit.allowed) return claimRateLimited(limit.retryAfterSeconds)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return claimValidationProblem([{ path: '', message: 'malformed JSON' }])
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return claimValidationProblem([{ path: 'ephemeralPublicKey', message: 'must be a Stellar public key (G…)' }])
  try {
    const outcome = await passkeyRegisterOptions(parsed.data.ephemeralPublicKey)
    if (outcome.kind === 'not-found') return claimNotFound()
    if (outcome.kind === 'conflict') return claimConflict(outcome.detail)
    return Response.json(outcome.value, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'passkey register options failed')
    return claimServerError()
  }
}
