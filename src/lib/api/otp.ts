/**
 * OTP application gate for creator-assigned recipient email bindings.
 * Claim URLs remain in the private browser export. Only codes are emailed.
 * This gate is enforced by Kleym, not an extra on-chain signing condition;
 * possession of a link key still permits constructing Stellar transactions.
 */
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import argon2 from 'argon2'
import { prisma } from '@/lib/db/client'
import { redis } from '@/lib/redis/client'
import { logger } from '@/lib/config/logger'

/** SPEC.md §6.4: six digits, ten minutes, five attempts. */
export const OTP_TTL_MS = 10 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5
const OTP_TOKEN_TTL_SECONDS = 30 * 60

/** Matches lib/auth/password.ts. Change both together. */
const ARGON = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

/**
 * A six-digit code from `randomInt`, not `Math.random`.
 *
 * `Math.random` is not a CSPRNG, and this code is the only thing standing
 * between a forwarded email and someone else's money. `randomInt` is rejection
 * sampled, so every code from 000000 to 999999 is equally likely — a modulo of
 * a random byte string is not.
 */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export type OtpOutcome =
  | { kind: 'ok' }
  | { kind: 'not-gated' }
  | { kind: 'no-link' }
  | { kind: 'locked'; detail: string }

/**
 * Whether this link has an email binding, and its assigned address. `email`
 * is null after redaction (#50): the link stays gated, but no code can be sent.
 */
export async function gateFor(ephemeralPublicKey: string): Promise<{
  linkId: string
  deliveryId: string
  email: string | null
  claimable: boolean
} | null> {
  const link = await prisma.claimLink.findUnique({
    where: { ephemeralPublicKey },
    select: { id: true, status: true, suspendedAt: true, campaign: { select: { expiresAt: true, suspendedAt: true, status: true } }, delivery: { select: { id: true, email: true } } },
  })
  if (!link?.delivery) return null
  return { linkId: link.id, deliveryId: link.delivery.id, email: link.delivery.email,
    claimable: link.status === 'ACTIVE' && !link.suspendedAt && !link.campaign.suspendedAt && link.campaign.status !== 'CANCELLED' && link.campaign.expiresAt.getTime() > Date.now() }
}

/**
 * Issues a fresh code, replacing any outstanding one.
 *
 * The attempt counter resets with the code. It counts guesses against ONE
 * code, and a recipient who legitimately asks for a new one after mistyping
 * the old should not inherit the old one's failures. Flooding is prevented by
 * the rate limits on the route, not by refusing to reissue — refusing would
 * let anyone lock a recipient out by requesting once.
 */
export async function issueOtp(
  deliveryId: string,
  now: Date = new Date(),
): Promise<string> {
  const code = generateOtp()
  await prisma.delivery.update({
    where: { id: deliveryId },
    data: {
      otpHash: await argon2.hash(code, ARGON),
      otpExpires: new Date(now.getTime() + OTP_TTL_MS),
      otpAttempts: 0,
    },
  })
  // The code is returned to be MAILED and never logged (AGENT.md §4.5).
  return code
}

export type VerifyResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'wrong' | 'expired' | 'locked' | 'none-issued'; attemptsLeft: number }

/**
 * Checks a code and, on success, issues the token that unlocks claiming.
 *
 * The attempt counter is incremented BEFORE the comparison, so a request that
 * dies mid-verification has still been counted. Counting afterwards would let
 * an attacker abandon each connection the instant it looked slow and guess
 * without limit.
 */
export async function verifyOtp(
  ephemeralPublicKey: string,
  code: string,
  now: Date = new Date(),
): Promise<VerifyResult> {
  const gate = await gateFor(ephemeralPublicKey)
  if (!gate || !gate.email || !gate.claimable) return { ok: false, reason: 'none-issued', attemptsLeft: 0 }

  const delivery = await prisma.delivery.findUniqueOrThrow({
    where: { id: gate.deliveryId },
    select: { otpHash: true, otpExpires: true, otpAttempts: true },
  })

  /*
   * Lockout is checked BEFORE "no code issued", and the order matters.
   *
   * A spent code is destroyed rather than left in place with a spent counter,
   * so after the fifth wrong guess there is no hash to find. Checking for the
   * missing hash first reported that as "ask for a code", losing the fact that
   * the recipient had just been locked out — which is the one thing worth
   * telling them, and worth an operator seeing. A reissue resets the counter,
   * so this cannot strand someone who legitimately asks for a new code.
   */
  if (delivery.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: 'locked', attemptsLeft: 0 }
  }
  if (!delivery.otpHash || !delivery.otpExpires) {
    return { ok: false, reason: 'none-issued', attemptsLeft: 0 }
  }
  if (delivery.otpExpires.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired', attemptsLeft: OTP_MAX_ATTEMPTS - delivery.otpAttempts }
  }

  // Reserve a guess atomically against THIS challenge. Concurrent requests
  // cannot exceed five attempts or spend a replacement code's attempt budget.
  const reserved = await prisma.delivery.updateMany({
    where: { id: gate.deliveryId, otpHash: delivery.otpHash, otpExpires: { gt: now }, otpAttempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { otpAttempts: { increment: 1 } },
  })
  if (!reserved.count) return { ok: false, reason: 'locked', attemptsLeft: 0 }

  if (!(await argon2.verify(delivery.otpHash, code).catch(() => false))) {
    const current = await prisma.delivery.findUniqueOrThrow({ where: { id: gate.deliveryId }, select: { otpAttempts: true } })
    const left = Math.max(0, OTP_MAX_ATTEMPTS - current.otpAttempts)
    if (left === 0) {
      /*
       * Spent codes are DESTROYED, not merely counted out.
       *
       * Leaving the hash in place with a spent counter means a later reissue
       * bug, or a manual counter reset, silently re-enables a code an attacker
       * has already been grinding against.
       */
      await prisma.delivery.updateMany({
        where: { id: gate.deliveryId, otpHash: delivery.otpHash, otpAttempts: { gte: OTP_MAX_ATTEMPTS } },
        data: { otpHash: null, otpExpires: null },
      })
      logger.warn({ deliveryId: gate.deliveryId }, 'otp invalidated after too many attempts')
    }
    return { ok: false, reason: left === 0 ? 'locked' : 'wrong', attemptsLeft: left }
  }

  /*
   * A single-use code. Consuming it on success stops a forwarded email being
   * replayed by a second reader while the ten minutes are still running.
   */
  const consumed = await prisma.delivery.updateMany({
    where: { id: gate.deliveryId, otpHash: delivery.otpHash, otpExpires: { gt: now } },
    data: { otpHash: null, otpExpires: null, otpAttempts: 0, openedAt: now },
  })
  if (!consumed.count) return { ok: false, reason: 'none-issued', attemptsLeft: 0 }

  return { ok: true, token: await issueToken(gate.linkId) }
}

/**
 * The token that proves a code was entered, held server-side.
 *
 * Opaque and stored hashed, exactly like a session (AGENT.md §5.2): what the
 * client holds is not what Redis holds, so a dump of Redis does not yield
 * usable tokens. It is scoped to one link and expires in thirty minutes —
 * long enough to finish a two-transaction claim, short enough that a device
 * left open is not a standing key.
 */
async function issueToken(linkId: string): Promise<string> {
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
  await redis.set(tokenKey(token), linkId, 'EX', OTP_TOKEN_TTL_SECONDS)
  return token
}

const tokenKey = (token: string) => `otp:token:${createHash('sha256').update(token).digest('hex')}`

/**
 * Whether this request may act on this link.
 *
 * Returns true for links with no email binding. EMAIL policy additionally
 * refuses a missing binding in claim-policy.ts; it cannot downgrade to OPEN.
 *
 * Fails CLOSED when Redis is unreachable, for the same reason the rate limiter
 * does: an unavailable check that answers "allowed" removes the control at the
 * moment something is already wrong.
 */
export async function otpSatisfied(
  ephemeralPublicKey: string,
  token: string | null,
): Promise<boolean> {
  const gate = await gateFor(ephemeralPublicKey)
  if (!gate) return true
  if (!token) return false

  try {
    const linkId = await redis.get(tokenKey(token))
    if (!linkId) return false
    // Compared in constant time. The token is a credential, and an early-exit
    // comparison over a value an attacker can vary is a timing oracle.
    const a = Buffer.from(linkId)
    const b = Buffer.from(gate.linkId)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch (error) {
    logger.error(
      { reason: error instanceof Error ? error.message : 'unknown' },
      'otp token store unavailable; denying',
    )
    return false
  }
}
