/**
 * GET /api/stellar/account?publicKey=G… — the sender's balances.
 *
 * Step 1 of the wizard validates the chosen asset against what the sender
 * actually holds, and shows the available balance. The browser cannot ask
 * Horizon itself (`connect-src 'self'`), so this proxies the one read it needs
 * and nothing else — balances, and whether the account exists.
 */
import { StrKey } from '@stellar/stellar-sdk'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { requireUser } from '@/lib/api/session-guard'
import { serverError, validationProblem } from '@/lib/api/problems'
import { baseReserve, horizon } from '@/lib/stellar/horizon'
import { fundingBalances } from '@/lib/stellar/funding-balances'
import { env } from '@/lib/config/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { user, response } = await requireUser()
  if (!user) return response

  const publicKey = new URL(request.url).searchParams.get('publicKey') ?? ''

  /*
   * Scanned before StrKey, deliberately.
   *
   * `StrKey.isValidEd25519PublicKey` returns false for a seed, so a seed
   * pasted into this field would fall out as an ordinary validation error and
   * never be recorded. Nothing in Kleym should ever put a seed in a query
   * string — it would reach the access log — so if a future change does, it
   * fails loudly (AGENT.md §5.4).
   */
  const blocked = guardRequestBody(publicKey, { route: '/api/stellar/account', ip: clientIp(request) })
  if (blocked) return blocked.response

  if (!StrKey.isValidEd25519PublicKey(publicKey)) {
    return validationProblem([{ path: 'publicKey', message: 'must be a Stellar public key (G…)' }])
  }

  try {
    const account = await horizon().loadAccount(publicKey)
    const reserve = await baseReserve()
    return Response.json({
      network: env.STELLAR_NETWORK,
      exists: true,
      balances: fundingBalances(account, reserve),
      subentryCount: account.subentry_count,
    })
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 404 || (error as { name?: string })?.name === 'NotFoundError') {
      // Not an error: an unfunded account is a normal thing for the wizard to
      // report, and the sender needs to be told rather than shown a failure.
      return Response.json({ network: env.STELLAR_NETWORK, exists: false, balances: [], subentryCount: 0 })
    }
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'account lookup failed')
    return serverError()
  }
}
