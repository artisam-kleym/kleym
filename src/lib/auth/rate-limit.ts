/**
 * Redis-backed rate limiting. AGENT.md §5.6.
 *
 * Fixed window rather than sliding: simpler, and the failure mode (a burst
 * across a window boundary) is acceptable for login, where the account lockout
 * in AGENT.md §5.1 is the real backstop.
 */
import { redis } from '@/lib/redis/client'
import { logger } from '@/lib/config/logger'
import { recordRateLimitRejection } from '@/lib/observability/metrics'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`

  try {
    // INCR then EXPIRE only on first hit, so the window starts at the first
    // request rather than sliding forward with every one.
    const count = await redis.incr(redisKey)
    if (count === 1) await redis.expire(redisKey, windowSeconds)

    const ttl = count === 1 ? windowSeconds : await redis.ttl(redisKey)

    // Counted by route, never by key: the key's last segment is the caller.
    if (count > limit) recordRateLimitRejection(routeOf(key), 'limit')
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
    }
  } catch (error) {
    /*
     * FAIL CLOSED. A rate limiter that opens when its backing store is
     * unreachable removes the protection exactly when something is already
     * wrong — and this one guards login. Availability is the lesser loss.
     */
    logger.error(
      { rateLimitKey: key, reason: error instanceof Error ? error.message : 'unknown' },
      'rate limiter unavailable; denying',
    )
    // The limiter failing closed looks like an outage from outside; this is how it is told apart.
    recordRateLimitRejection(routeOf(key), 'unavailable')
    return { allowed: false, remaining: 0, retryAfterSeconds: windowSeconds }
  }
}

/**
 * `claims:submit:1.2.3.4` → `claims:submit`; `otp:request:ip:2001:db8::1` →
 * `otp:request:ip`; `apikey:<id>` → `apikey`. Only the leading segments that
 * are plain lowercase words are kept, so neither an address (IPv6 has its
 * own colons) nor a key id ever becomes a label.
 */
export function routeOf(key: string): string {
  const route: string[] = []
  for (const segment of key.split(':')) {
    if (!/^[a-z]+$/.test(segment)) break
    route.push(segment)
  }
  return route.join(':') || 'unknown'
}

export const LOGIN_RATE_LIMIT = { limit: 5, windowSeconds: 15 * 60 } as const

/**
 * Not in the AGENT.md §5.6 table, but /api/auth/password verifies the current
 * password and has no lockout behind it, so it is the one remaining
 * credential-checking endpoint with nothing in front of it.
 */
export const PASSWORD_CHANGE_RATE_LIMIT = { limit: 5, windowSeconds: 15 * 60 } as const

/**
 * /api/invite/redeem accepts a credential-shaped token from an unauthenticated
 * caller — the category AGENT.md §5.6 governs. Same shape as login.
 */
export const INVITE_REDEEM_RATE_LIMIT = { limit: 5, windowSeconds: 15 * 60 } as const
