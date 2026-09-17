/**
 * POST /api/claims/quote — a live receive-as quote (#74).
 *
 * Kleym's own Horizon client prices the link's asset into the one the
 * recipient is considering, and the response carries the bound TX2 will be
 * held to. Same-origin by construction: `/claim` makes zero third-party
 * requests (SPEC.md §3.6), so there is no price widget and no external SDK —
 * the page asks Kleym, and Kleym asks Horizon.
 *
 * A link that is not claimable answers 404 whatever the reason, as `prepare`
 * does — this must not become the oracle `resolve` refuses to be.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { guardRequestBody } from '@/lib/security/guard'
import { otpGate } from '@/lib/api/otp-guard'
import { quoteReceiveAs, quoteSchema } from '@/lib/api/claims'
import { zodErrors } from '@/lib/api/campaigns'
import {
  RESOLVE_LIMIT,
  claimConflict,
  claimNotFound,
  claimRateLimited,
  claimServerError,
  claimUnavailable,
  claimValidationProblem,
} from '@/lib/api/claim-problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const ip = clientIp(request)
  // Re-quoting while the recipient decides is the normal case; the resolve budget fits it.
  const limit = await rateLimit(`claims:quote:${ip}`, RESOLVE_LIMIT.limit, RESOLVE_LIMIT.windowSeconds)
  if (!limit.allowed) return claimRateLimited(limit.retryAfterSeconds)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return claimValidationProblem([{ path: '', message: 'malformed JSON' }])
  }

  const blocked = guardRequestBody(body, { route: '/api/claims/quote', ip })
  if (blocked) return blocked.response

  const parsed = quoteSchema.safeParse(body)
  if (!parsed.success) return claimValidationProblem(zodErrors(parsed.error))

  // Gated like every other action on the link: an emailed link's price is for
  // the person who holds the code, not for anyone holding the public key.
  const gated = await otpGate(request, parsed.data.ephemeralPublicKey)
  if (gated) return gated

  try {
    const outcome = await quoteReceiveAs(parsed.data.ephemeralPublicKey, parsed.data.receiveAs)
    if (outcome.kind === 'not-found') return claimNotFound()
    if (outcome.kind === 'conflict') return claimConflict(outcome.detail, outcome.reason)
    if (outcome.kind === 'unavailable') return claimUnavailable(outcome.detail)
    return Response.json(outcome.value, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'receive-as quote failed')
    return claimServerError()
  }
}
