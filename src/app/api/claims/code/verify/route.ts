/**
 * POST /api/claims/code/verify — the CODE policy's credential (#79).
 *
 * Thirteen Crockford-base32 characters from the sender's CSV, distributed
 * through a second channel. Five attempts, then a fifteen-minute lock — the
 * OTP's semantics — and the same per-IP and per-link rate limits as the OTP
 * verify. Returns the token the claim actions require.
 */
import { z } from 'zod'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { isClaimCode, verifyClaimCode } from '@/lib/api/claim-policy'
import { OTP_VERIFY_LIMIT, claimConflict, claimRateLimited, claimServerError, claimValidationProblem } from '@/lib/api/claim-problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z
  .object({
    ephemeralPublicKey: z.string().regex(/^G[A-Z2-7]{55}$/),
    // Bounded so the normaliser cannot be fed a megabyte; the shape check is below.
    code: z.string().min(1).max(32),
  })
  .strict()

export async function POST(request: Request) {
  const ip = clientIp(request)
  const byIp = await rateLimit(`code:verify:ip:${ip}`, OTP_VERIFY_LIMIT.limit, OTP_VERIFY_LIMIT.windowSeconds)
  if (!byIp.allowed) return claimRateLimited(byIp.retryAfterSeconds)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return claimValidationProblem([{ path: '', message: 'malformed JSON' }])
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success || !isClaimCode(parsed.data.code)) {
    return claimValidationProblem([{ path: 'code', message: 'must be the 13-character claim code' }])
  }

  const byLink = await rateLimit(`code:verify:link:${parsed.data.ephemeralPublicKey}`, OTP_VERIFY_LIMIT.limit, OTP_VERIFY_LIMIT.windowSeconds)
  if (!byLink.allowed) return claimRateLimited(byLink.retryAfterSeconds)

  try {
    const result = await verifyClaimCode(parsed.data.ephemeralPublicKey, parsed.data.code)
    if (!result.ok) {
      const detail = {
        wrong: `That code is not right. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'attempt' : 'attempts'} left.`,
        locked: `Too many attempts. Try again in ${Math.ceil((result.retryAfterSeconds ?? 900) / 60)} minutes.`,
        'not-code-policy': 'This link does not take a claim code.',
      }[result.reason]
      // The reason, never the code (AGENT.md §4.5).
      logger.info({ reason: result.reason }, 'claim code refused')
      return claimConflict(detail)
    }
    return Response.json({ token: result.token }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'claim code verify failed')
    return claimServerError()
  }
}
