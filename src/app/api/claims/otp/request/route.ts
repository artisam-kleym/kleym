/**
 * POST /api/claims/otp/request — mail a six-digit code. SPEC.md §6.4.
 *
 * Unauthenticated, like every other claim route: the recipient's credential is
 * the link they hold. Rate-limited per link AND per IP so neither a single
 * host nor a single link can be used to flood a mailbox.
 */
import { z } from 'zod'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { gateFor, issueOtp } from '@/lib/api/otp'
import { otpEmail } from '@/lib/email/templates'
import { resend } from '@/lib/email/provider'
import {
  OTP_REQUEST_LIMIT,
  claimRateLimited,
  claimServerError,
  claimValidationProblem,
} from '@/lib/api/claim-problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z
  .object({ ephemeralPublicKey: z.string().regex(/^G[A-Z2-7]{55}$/) })
  .strict()

export async function POST(request: Request) {
  const ip = clientIp(request)
  const byIp = await rateLimit(`otp:request:ip:${ip}`, OTP_REQUEST_LIMIT.limit, OTP_REQUEST_LIMIT.windowSeconds)
  if (!byIp.allowed) return claimRateLimited(byIp.retryAfterSeconds)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return claimValidationProblem([{ path: '', message: 'malformed JSON' }])
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return claimValidationProblem([{ path: 'ephemeralPublicKey', message: 'must be a Stellar public key (G…)' }])
  }

  const { ephemeralPublicKey } = parsed.data
  const byLink = await rateLimit(
    `otp:request:link:${ephemeralPublicKey}`,
    OTP_REQUEST_LIMIT.limit,
    OTP_REQUEST_LIMIT.windowSeconds,
  )
  if (!byLink.allowed) return claimRateLimited(byLink.retryAfterSeconds)

  try {
    const gate = await gateFor(ephemeralPublicKey)

    /*
     * The SAME answer whether or not this link is email-delivered.
     *
     * Distinguishing them tells anyone who tries a key whether it exists and
     * whether it was mailed — the enumeration oracle SPEC.md §6.4 forbids on
     * `resolve`, which would be pointless to close there and leave open here.
     */
    if (!gate) return Response.json({ sent: true }, { headers: { 'cache-control': 'no-store' } })

    const code = await issueOtp(gate.deliveryId)

    /*
     * A FAILED SEND STILL ANSWERS `sent: true`, and that is the point.
     *
     * The early return above already answers `sent: true` for a key that is
     * not email-delivered, so letting a provider outage turn a REAL link into
     * a 500 hands back exactly the oracle this endpoint is shaped to deny: a
     * 500 would mean "this key exists and was emailed", a 200 would mean it
     * was not. Found by testing both paths against a deployment whose provider
     * key is a placeholder — the two answers differed.
     *
     * The failure is not swallowed: it is logged at ERROR for an operator, and
     * the recipient's remedy is the one they already have, which is to ask for
     * another code.
     */
    try {
      await resend({ to: gate.email, ...otpEmail(code) })
      // The delivery id only. Never the code (AGENT.md §4.5), never the address.
      logger.info({ deliveryId: gate.deliveryId }, 'otp mailed')
    } catch (error) {
      logger.error(
        { deliveryId: gate.deliveryId, reason: error instanceof Error ? error.message : 'unknown' },
        'otp could not be mailed',
      )
    }

    return Response.json({ sent: true }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    /*
     * Reached only when the DATABASE work fails, which is not link-specific
     * and so tells an attacker nothing about whether the key exists.
     */
    logger.error(
      { reason: error instanceof Error ? error.message : 'unknown' },
      'otp request failed',
    )
    return claimServerError()
  }
}
