/**
 * POST /api/claims/prepare/materialise — TX1. SPEC.md §3.3, §3.3.3 step 2.
 *
 * Materialises the ephemeral account so TX2 can claim from it one ledger later.
 * Returns `{ alreadyExists: true }` with no XDR when the account is already on
 * the ledger — the retry path, and the reason this is its own endpoint rather
 * than a phase field (§3.3.3).
 *
 * The seed never arrives here. The client sends the ephemeral PUBLIC key,
 * derived in the browser from the URL fragment.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { guardRequestBody } from '@/lib/security/guard'
import { materialiseSchema, prepareMaterialise } from '@/lib/api/claims'
import { zodErrors } from '@/lib/api/campaigns'
import {
  MATERIALISE_LIMIT,
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
  const limit = await rateLimit(
    `claims:materialise:${ip}`,
    MATERIALISE_LIMIT.limit,
    MATERIALISE_LIMIT.windowSeconds,
  )
  if (!limit.allowed) return claimRateLimited(limit.retryAfterSeconds)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return claimValidationProblem([{ path: '', message: 'malformed JSON' }])
  }

  /*
   * The seed scan runs FIRST, and it matters more here than anywhere.
   *
   * This is the endpoint a confused client is likeliest to post a seed to — it
   * is the one that takes "the ephemeral key", and the caller holds the seed.
   * Nothing in Kleym should ever send it; if a future change does, this fails
   * loudly and records a security event (AGENT.md §5.4).
   */
  const blocked = guardRequestBody(body, { route: '/api/claims/prepare/materialise', ip })
  if (blocked) return blocked.response

  const parsed = materialiseSchema.safeParse(body)
  if (!parsed.success) return claimValidationProblem(zodErrors(parsed.error))

  try {
    const outcome = await prepareMaterialise(parsed.data.ephemeralPublicKey)
    if (outcome.kind === 'not-found') return claimNotFound()
    if (outcome.kind === 'conflict') return claimConflict(outcome.detail, outcome.reason)
    if (outcome.kind === 'unavailable') return claimUnavailable(outcome.detail)

    return Response.json(outcome.value, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    // No body, and no key. AGENT.md §4.5.
    logger.error(
      { reason: error instanceof Error ? error.message : 'unknown' },
      'claim materialise failed',
    )
    return claimServerError()
  }
}
