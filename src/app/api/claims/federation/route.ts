/**
 * POST /api/claims/federation — resolve `name*domain.com` to an address and memo (#75).
 *
 * Kleym's SERVER does the lookup, so `/claim` still makes no third-party
 * request (SPEC.md §3.6). The federation server is the exchange's own, found
 * through its stellar.toml over HTTPS only. What comes back is an address and,
 * usually, the memo the exchange wants — which the recipient then sees and
 * confirms before anything is built. Nothing about the link is involved, so
 * this is not an enumeration surface; it is rate-limited like resolve.
 */
import { Federation } from '@stellar/stellar-sdk'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { guardRequestBody } from '@/lib/security/guard'
import { memoTypeFromFederation } from '@/lib/stellar/memo'
import { zodErrors } from '@/lib/api/campaigns'
import { z } from 'zod'
import {
  RESOLVE_LIMIT,
  claimConflict,
  claimRateLimited,
  claimValidationProblem,
} from '@/lib/api/claim-problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** `name*domain` — SEP-0002. The domain part is what the lookup fetches from. */
const FEDERATION_ADDRESS = /^[^*\s]{1,64}\*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i

const schema = z.object({ address: z.string().regex(FEDERATION_ADDRESS, 'must be a federation address (name*domain.com)') }).strict()

export async function POST(request: Request) {
  const ip = clientIp(request)
  const limit = await rateLimit(`claims:federation:${ip}`, RESOLVE_LIMIT.limit, RESOLVE_LIMIT.windowSeconds)
  if (!limit.allowed) return claimRateLimited(limit.retryAfterSeconds)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return claimValidationProblem([{ path: '', message: 'malformed JSON' }])
  }

  const blocked = guardRequestBody(body, { route: '/api/claims/federation', ip })
  if (blocked) return blocked.response

  const parsed = schema.safeParse(body)
  if (!parsed.success) return claimValidationProblem(zodErrors(parsed.error))

  try {
    // HTTPS only, bounded: an exchange's federation server that is slow or
    // down should say so within a few seconds, not hang the page.
    const record = await Federation.Server.resolve(parsed.data.address, { allowHttp: false, timeout: 5_000 })
    const memoType = memoTypeFromFederation(record.memo_type)
    return Response.json(
      {
        accountId: record.account_id,
        memo: memoType && record.memo !== undefined ? { type: memoType, value: String(record.memo) } : null,
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    // The address, not the error text, is what the recipient can act on.
    logger.warn({ reason: error instanceof Error ? error.message : 'unknown' }, 'federation lookup failed')
    return claimConflict('That address could not be looked up. Check it with your exchange, or enter the deposit address and memo directly.')
  }
}
