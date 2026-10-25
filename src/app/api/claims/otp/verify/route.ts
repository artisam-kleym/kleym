/**
 * POST /api/claims/otp/verify — six digits, five attempts. SPEC.md §6.4.
 *
 * Returns an opaque token the claim endpoints require for gated links. The
 * token is what the rest of the flow checks; nothing downstream re-reads the
 * code.
 */
import { z } from 'zod'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { verifyOtp } from '@/lib/api/otp'
import {
  OTP_VERIFY_LIMIT,
  OTP_VERIFY_IP_LIMIT,
  claimConflict,
  claimRateLimited,
  claimServerError,
  claimValidationProblem,
} from '@/lib/api/claim-problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z
  .object({
    ephemeralPublicKey: z.string().regex(/^G[A-Z2-7]{55}$/),
    // Exactly six digits. A length-flexible field would let a client probe
    // with prefixes and learn from the timing.
    code: z.string().regex(/^[0-9]{6}$/),
  })
  .strict()

export async function POST(request: Request) {
  const ip = clientIp(request)
  const byIp = await rateLimit(`otp:verify:ip:${ip}`, OTP_VERIFY_IP_LIMIT.limit, OTP_VERIFY_IP_LIMIT.windowSeconds)
  if (!byIp.allowed) return claimRateLimited(byIp.retryAfterSeconds)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return claimValidationProblem([{ path: '', message: 'malformed JSON' }])
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return claimValidationProblem([{ path: 'code', message: 'must be six digits' }])
  }

  const byLink = await rateLimit(
    `otp:verify:link:${parsed.data.ephemeralPublicKey}`,
    OTP_VERIFY_LIMIT.limit,
    OTP_VERIFY_LIMIT.windowSeconds,
  )
  if (!byLink.allowed) return claimRateLimited(byLink.retryAfterSeconds)

  try {
    const result = await verifyOtp(parsed.data.ephemeralPublicKey, parsed.data.code)

    if (!result.ok) {
      /*
       * The reason is told plainly, and the attempts remaining with it.
       *
       * This is not an enumeration surface: reaching here at all requires a
       * well-formed key AND a code, and a recipient who has mistyped needs to
       * know whether to retype or to ask for a new code. Hiding "expired"
       * behind "wrong" just makes them burn their remaining attempts.
       */
      const detail = {
        wrong: `That code is not right. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'attempt' : 'attempts'} left.`,
        expired: 'That code has expired. Ask for a new one.',
        locked: 'Too many attempts. Ask for a new code.',
        'none-issued': 'There is no code outstanding for this link. Ask for one.',
      }[result.reason]

      logger.info({ reason: result.reason }, 'otp verification refused')
      return claimConflict(detail)
    }

    return Response.json(
      { verified: true, token: result.token },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'otp verify failed')
    return claimServerError()
  }
}
