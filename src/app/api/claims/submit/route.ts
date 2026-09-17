/**
 * POST /api/claims/submit — submit a signed envelope. SPEC.md §3.3.3 step 7.
 *
 * A link is marked CLAIMED here and nowhere else, and only from a transaction
 * Horizon accepted into a closed ledger — never from a client assertion
 * (AGENT.md §4.2).
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { claimPolicyGate } from '@/lib/api/claim-policy'
import { rateLimit } from '@/lib/auth/rate-limit'
import { guardRequestBody } from '@/lib/security/guard'
import { submitClaim, submitSchema } from '@/lib/api/claims'
import { zodErrors } from '@/lib/api/campaigns'
import {
  SUBMIT_LIMIT,
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
  const limit = await rateLimit(`claims:submit:${ip}`, SUBMIT_LIMIT.limit, SUBMIT_LIMIT.windowSeconds)
  if (!limit.allowed) return claimRateLimited(limit.retryAfterSeconds)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return claimValidationProblem([{ path: '', message: 'malformed JSON' }])
  }

  const blocked = guardRequestBody(body, { route: '/api/claims/submit', ip })
  if (blocked) return blocked.response

  const parsed = submitSchema.safeParse(body)
  if (!parsed.success) return claimValidationProblem(zodErrors(parsed.error))

  /*
   * No Idempotency-Key header. These endpoints are unauthenticated, so there is
   * no user to scope a key to — and lib/api/idempotency.ts is keyed on
   * (userId, key) precisely so one caller's key cannot address another's row.
   * The transaction hash is intrinsic to the envelope and serves the same
   * purpose here: the same bytes land on the same link, whoever sends them.
   */

  /*
   * The OTP gate, applied to every claim ACTION rather than only the first.
   * Gating just `materialise` would let a caller skip to the step that moves
   * the money. Ungated links pass straight through (SPEC.md §6.4).
   */
  const gated = await claimPolicyGate(request, parsed.data.ephemeralPublicKey)
  if (gated) return gated
  try {
    const outcome = await submitClaim(
      parsed.data.ephemeralPublicKey,
      parsed.data.signedXdr,
      parsed.data.phase,
    )
    if (outcome.kind === 'not-found') return claimNotFound()
    if (outcome.kind === 'conflict') return claimConflict(outcome.detail, outcome.reason)
    if (outcome.kind === 'unavailable') return claimUnavailable(outcome.detail)

    return Response.json(outcome.value, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'claim submit failed')
    return claimServerError()
  }
}
