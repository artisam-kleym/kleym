/**
 * POST /api/claims/passkey/register — verify the WebAuthn response and the
 * holder's proof over its challenge, bind the link, issue the token (#79).
 */
import { z } from 'zod'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { passkeyRegister } from '@/lib/api/claim-passkey'
import { emailedFirst } from '@/lib/api/claim-policy'
import { OTP_VERIFY_LIMIT, claimConflict, claimNotFound, claimRateLimited, claimServerError, claimValidationProblem } from '@/lib/api/claim-problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z
  .object({
    ephemeralPublicKey: z.string().regex(/^G[A-Z2-7]{55}$/),
    // The authenticator's JSON, checked in full by @simplewebauthn/server.
    response: z.object({ id: z.string().min(1) }).passthrough(),
    // The holder's proof: the ephemeral keypair's signature over the challenge, base64 (64 bytes).
    proof: z.string().regex(/^[A-Za-z0-9+/]{86}==$/, 'must be an ed25519 signature'),
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
    // An emailed link's OTP comes first (#14): a forwarded email must not bind a device.
    const first = await emailedFirst(parsed.data.ephemeralPublicKey, request)
    if (first) return claimConflict(first.detail, first.reason)

    const outcome = await passkeyRegister(parsed.data.ephemeralPublicKey, parsed.data.response as never, parsed.data.proof)
    if (outcome.kind === 'not-found') return claimNotFound()
    if (outcome.kind === 'conflict') return claimConflict(outcome.detail)
    return Response.json(outcome.value, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'passkey register failed')
    return claimServerError()
  }
}
