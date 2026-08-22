/**
 * GET /api/claims/resolve?pk=<G…> — link metadata for the claim page.
 *
 * SPEC.md §6.4. Unauthenticated, and the response shape is IDENTICAL for
 * unknown, expired, claimed and cancelled links. Anything that distinguishes
 * them lets an attacker walk the keyspace and find live ones — and a live link
 * is a bearer instrument (§12), claimable by whoever holds it.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { resolveLink, unavailableLink } from '@/lib/api/claims'
import {
  RESOLVE_LIMIT,
  claimRateLimited,
  claimValidationProblem,
} from '@/lib/api/claim-problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PUBLIC_KEY = /^G[A-Z2-7]{55}$/

export async function GET(request: Request) {
  const ip = clientIp(request)
  const limit = await rateLimit(`claims:resolve:${ip}`, RESOLVE_LIMIT.limit, RESOLVE_LIMIT.windowSeconds)
  if (!limit.allowed) return claimRateLimited(limit.retryAfterSeconds)

  const pk = new URL(request.url).searchParams.get('pk') ?? ''

  /*
   * A malformed key is a 400, but a well-formed key that does not exist is a
   * 200 carrying `unavailable` — the same as expired or claimed. Distinguishing
   * "not a key" from "not a link" is safe; distinguishing "no such link" from
   * "already claimed" is the enumeration oracle §6.4 forbids.
   */
  if (!PUBLIC_KEY.test(pk)) {
    return claimValidationProblem([{ path: 'pk', message: 'must be a Stellar public key (G…)' }])
  }

  try {
    return Response.json(await resolveLink(pk), { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    // Never the key, and never the request. AGENT.md §4.5 forbids logging
    // request bodies on claim routes; the key identifies the link, so it is
    // treated the same way.
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'claim resolve failed')

    /*
     * A failure returns the SAME shape a miss returns. A 500 here would be a
     * differential response by another name: it would tell an enumerator that
     * this key hit a code path an unknown key does not.
     */
    return Response.json(unavailableLink(), { headers: { 'cache-control': 'no-store' } })
  }
}
