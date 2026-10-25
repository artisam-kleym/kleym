/**
 * POST /api/claims/otp/request — mail a six-digit code. SPEC.md §6.4.
 *
 * Unauthenticated, like every other claim route: the recipient's credential is
 * the link they hold. Rate-limited per link AND per IP so neither a single
 * host nor a single link can be used to flood a mailbox.
 */
import { z } from 'zod'
import { env } from '@/lib/config/env'
import { enqueueEmailStatus } from '@/lib/queue/email-status'
import { ZenderError } from '@/lib/email/zender'
import { createHash, randomUUID } from 'node:crypto'
import { redis } from '@/lib/redis/client'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { gateFor, issueOtp } from '@/lib/api/otp'
import { otpEmail } from '@/lib/email/templates'
import { resend } from '@/lib/email/provider'
import {
  OTP_REQUEST_LIMIT,
  OTP_REQUEST_IP_LIMIT,
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
  const byIp = await rateLimit(`otp:request:ip:${ip}`, OTP_REQUEST_IP_LIMIT.limit, OTP_REQUEST_IP_LIMIT.windowSeconds)
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

    /*
     * A redacted address (#50) gets the same `sent: true` for the same
     * reason: whether a key's address was erased is not this endpoint's to
     * reveal. No code is issued — there is nowhere to send it.
     */
    if (!gate.email || !gate.claimable) return Response.json({ sent: true }, { headers: { 'cache-control': 'no-store' } })

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
      // Multiple links for one inbox must not multiply its mail rate. The
      // address never appears in a Redis key or a response.
      const mailbox = createHash('sha256').update(gate.email.toLowerCase()).digest('hex')
      const allowed = await rateLimit(`otp:request:mailbox:${mailbox}`, OTP_REQUEST_LIMIT.limit, OTP_REQUEST_LIMIT.windowSeconds)
      if (!allowed.allowed) return Response.json({ sent: true }, { headers: { 'cache-control': 'no-store' } })
      const nonce = randomUUID()
      const lockKey = `otp:send:${gate.deliveryId}`
      if (!(await redis.set(lockKey, nonce, 'EX', 30, 'NX'))) return Response.json({ sent: true }, { headers: { 'cache-control': 'no-store' } })
      try {
        const code = await issueOtp(gate.deliveryId)
        const { id } = await resend({ to: gate.email, ...otpEmail(code), idempotencyKey: `otp:${gate.deliveryId}:${randomUUID()}` })
        // Never the code (AGENT.md §4.5), never the address.
        logger.info({ deliveryId: gate.deliveryId, providerId: id }, 'otp mail accepted; delivery unconfirmed')
        if (env.EMAIL_PROVIDER === 'zender') {
          try { await enqueueEmailStatus({ deliveryId: gate.deliveryId, providerId: id }) }
          catch { logger.error({ deliveryId: gate.deliveryId, providerId: id }, 'OTP accepted but delivery monitor unavailable; operator review required') }
        }
      } finally {
        await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, lockKey, nonce)
      }
    } catch (error) {
      logger.error(
        { deliveryId: gate.deliveryId, reason: error instanceof ZenderError ? error.message : 'mail request failed',
          ...(error instanceof ZenderError ? { status: error.status, requestId: error.requestId, retryAfterSeconds: error.retryAfterSeconds } : {}) },
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
