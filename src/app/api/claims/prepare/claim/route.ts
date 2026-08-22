/**
 * POST /api/claims/prepare/claim — TX2. SPEC.md §3.3, §3.3.3 step 5.
 *
 * Claims the balance, forwards it to the recipient, drops the ephemeral
 * trustline and merges the account away. Must be called after TX1 has landed
 * in an EARLIER ledger (§3.3.1) — the service refuses otherwise rather than
 * letting the network answer `op_seq_num_too_far`.
 *
 * The response says whether the RECIPIENT must sign. Signing when they are not
 * an operation source returns `tx_bad_auth_extra`, so the client must be told
 * rather than guessing.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { guardRequestBody } from '@/lib/security/guard'
import { claimSchema, prepareClaim } from '@/lib/api/claims'
import { zodErrors } from '@/lib/api/campaigns'
import {
  CLAIM_LIMIT,
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
  const limit = await rateLimit(`claims:claim:${ip}`, CLAIM_LIMIT.limit, CLAIM_LIMIT.windowSeconds)
  if (!limit.allowed) return claimRateLimited(limit.retryAfterSeconds)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return claimValidationProblem([{ path: '', message: 'malformed JSON' }])
  }

  const blocked = guardRequestBody(body, { route: '/api/claims/prepare/claim', ip })
  if (blocked) return blocked.response

  const parsed = claimSchema.safeParse(body)
  if (!parsed.success) return claimValidationProblem(zodErrors(parsed.error))

  try {
    const outcome = await prepareClaim(parsed.data.ephemeralPublicKey, parsed.data.recipientPublicKey)
    if (outcome.kind === 'not-found') return claimNotFound()
    if (outcome.kind === 'conflict') return claimConflict(outcome.detail)
    if (outcome.kind === 'unavailable') return claimUnavailable(outcome.detail)

    return Response.json(outcome.value, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'claim prepare failed')
    return claimServerError()
  }
}
