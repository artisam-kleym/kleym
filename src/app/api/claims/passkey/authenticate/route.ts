/**
 * POST /api/claims/passkey/authenticate — verify the WebAuthn response and issue the token (#79).
 */
import { z } from 'zod'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { passkeyAuthenticate } from '@/lib/api/claim-passkey'
import { OTP_VERIFY_LIMIT, claimConflict, claimNotFound, claimRateLimited, claimServerError, claimValidationProblem } from '@/lib/api/claim-problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z
  .object({
    ephemeralPublicKey: z.string().regex(/^G[A-Z2-7]{55}$/),
    // The authenticator's JSON, checked in full by @simplewebauthn/server.
    response: z.object({ id: z.string().min(1) }).passthrough(),
  })
  .strict()

export async function POST(request: Request) {
  const ip = clientIp(request)
  const limit = await rateLimit(`claims:passkey:verify:${ip}`, OTP_VERIFY_LIMIT.limit, OTP_VERIFY_LIMIT.windowSeconds)
  if (!limit.allowed) return claimRateLimited(limit.retryAfterSeconds)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return claimValidationProblem([{ path: '', message: 'malformed JSON' }])
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return claimValidationProblem([{ path: 'response', message: 'must be a WebAuthn response' }])
  try {
    const outcome = await passkeyAuthenticate(parsed.data.ephemeralPublicKey, parsed.data.response as never)
    if (outcome.kind === 'not-found') return claimNotFound()
    if (outcome.kind === 'conflict') return claimConflict(outcome.detail)
    return Response.json(outcome.value, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'passkey authenticate failed')
    return claimServerError()
  }
}
