/**
 * GET /api/stellar/reserve — the live reserve figures the wizard prices with.
 *
 * SPEC.md §3.2 requires the base reserve be read from the protocol at runtime.
 * The browser cannot read it itself: CSP is `connect-src 'self'`, and relaxing
 * that to reach Horizon would open an egress path on the same origin that
 * serves the wizard where seeds are generated. So the server reads it.
 */
import { logger } from '@/lib/config/logger'
import { requireUser } from '@/lib/api/session-guard'
import { serverError } from '@/lib/api/problems'
import { baseReserve, reservePerLink } from '@/lib/stellar/horizon'
import { CLAIMANTS_PER_LINK } from '@/lib/api/batches'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { user, response } = await requireUser()
  if (!user) return response

  try {
    const base = await baseReserve()
    return Response.json({
      baseReserve: base.toString(),
      claimantsPerLink: CLAIMANTS_PER_LINK,
      reservePerLink: reservePerLink(base, CLAIMANTS_PER_LINK).toString(),
    })
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'reserve lookup failed')
    return serverError()
  }
}
