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
import { StrKey } from '@stellar/stellar-sdk'
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { rateLimit } from '@/lib/auth/rate-limit'
import { guardRequestBody } from '@/lib/security/guard'
import { federationServerOf, isPublicHost, memoFromRecord } from '@/lib/stellar/federation'
import { outboundFetch } from '@/lib/validation/outbound-fetch'
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

/**
 * The lookup is a server-side fetch to a host the caller names — first the
 * domain's stellar.toml, then whatever FEDERATION_SERVER it declares. That is
 * a request primitive into anything Kleym's server can reach, so both hosts
 * are held to "a public name": no IP literals in any spelling, no loopback,
 * link-local, private or reserved ranges, no localhost / .local / .internal
 * / .localhost, no ports — and neither fetch follows a redirect, so a public
 * toml cannot bounce the request somewhere this check never saw. A DNS name
 * that later resolves to a private address (rebinding) is not caught here;
 * this is the surface the route can see.
 */
const FETCH_TIMEOUT_MS = 5_000
const MAX_BODY_BYTES = 100 * 1024

/**
 * One bounded, redirect-refusing HTTPS GET. Native fetch rather than the
 * SDK's resolvers, which follow redirects by default and give no way to say
 * otherwise — and a redirect is exactly how a public host would send this
 * request somewhere `isPublicHost` never saw.
 */
async function fetchPublic(url: string, accept: string): Promise<string> {
  const response = await outboundFetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept },
  })
  if (!response.ok) throw new Error(`upstream answered ${response.status}`)
  // The cap is enforced WHILE reading, in bytes: a hostile host must not be
  // able to make this server buffer an arbitrarily large body first.
  const declared = Number(response.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error('upstream body too large')
  if (!response.body) throw new Error('upstream sent no body')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new Error('upstream body too large')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * `FEDERATION_SERVER` from a stellar.toml: a top-level key, so only lines
 * before the first table header count. Enough of TOML for one string field;
 * the rest of the file is not read.
 */
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

  const domain = parsed.data.address.split('*')[1]!
  if (!isPublicHost(domain)) {
    return claimConflict('That address could not be looked up. Check it with your exchange, or enter the deposit address and memo directly.')
  }

  try {
    // HTTPS only, bounded, no redirects: an exchange's federation server that
    // is slow or down should say so within a few seconds, not hang the page.
    // Two steps, so the FEDERATION_SERVER host the toml names is checked
    // before anything is fetched from it.
    const toml = await fetchPublic(`https://${domain}/.well-known/stellar.toml`, 'text/plain')
    const federationUrl = federationServerOf(toml) ?? ''
    let federationHost = ''
    try {
      const url = new URL(federationUrl)
      // `hostname` has already dropped the port; a non-default port is
      // refused here, or "no ports" above would not hold for this hop.
      federationHost = url.protocol === 'https:' && url.port === '' ? url.hostname : ''
    } catch {
      federationHost = ''
    }
    if (!federationHost || !isPublicHost(federationHost)) {
      logger.warn({ domain }, 'federation server missing, not https, or not a public host; refused')
      return claimConflict('That address could not be looked up. Check it with your exchange, or enter the deposit address and memo directly.')
    }
    const query = new URL(federationUrl)
    query.searchParams.set('type', 'name')
    query.searchParams.set('q', parsed.data.address)
    const record = JSON.parse(await fetchPublic(query.toString(), 'application/json')) as { account_id?: unknown; memo_type?: unknown; memo?: unknown }

    // Defence in depth: what comes back is untrusted too. A key that is not a
    // Stellar public key — or is a SEED — never reaches the page.
    if (typeof record.account_id !== 'string' || !StrKey.isValidEd25519PublicKey(record.account_id)) {
      logger.warn({ domain }, 'federation record carried an invalid account id; refused')
      return claimConflict('That address could not be looked up. Check it with your exchange, or enter the deposit address and memo directly.')
    }
    return Response.json(
      {
        accountId: record.account_id,
        // A memo the exchange returned is checked as a typed memo would be; a malformed one is dropped, not relayed.
        memo: memoFromRecord(record),
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    // The address, not the error text, is what the recipient can act on.
    logger.warn({ reason: error instanceof Error ? error.message : 'unknown' }, 'federation lookup failed')
    return claimConflict('That address could not be looked up. Check it with your exchange, or enter the deposit address and memo directly.')
  }
}
