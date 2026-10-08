/**
 * OIDC authorization code flow with PKCE. Issue #46.
 *
 * Discovery from the issuer, state + nonce + code_verifier held in Redis
 * for five minutes and consumed on the callback, the code exchanged with
 * client_secret_post, the ID token verified against the IdP's JWKS (issuer,
 * audience, nonce, expiry). The access and refresh tokens the IdP returns
 * are used for one userinfo call at most and then DROPPED: nothing here
 * stores them, returns them, or logs them (AGENT.md §4.5). What comes out
 * is the claims, and the session Kleym then issues is its own opaque token.
 */
import { createHash, randomBytes } from 'node:crypto'
import { createRemoteJWKSet, customFetch, jwtVerify, type JWTPayload } from 'jose'
import { redis } from '@/lib/redis/client'
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'
import { decryptAtRest } from '@/lib/auth/at-rest'
import { outboundUrlFor } from '@/lib/validation/outbound-url'
import { outboundFetch } from '@/lib/validation/outbound-fetch'

export interface OidcConnection {
  id: string
  issuer: string
  clientId: string
  clientCiphertext: string
  scopes: string
  subjectClaim: string
  groupsClaim: string
}

interface Discovery {
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  userinfo_endpoint?: string
  issuer: string
}

const discoveryCache = new Map<string, { at: number; doc: Discovery }>()
const DISCOVERY_TTL_MS = 10 * 60 * 1000
const FLOW_TTL_SECONDS = 300

export class DiscoveryError extends Error {
  constructor(message: string, public readonly reason: 'unreachable' | 'incomplete' | 'issuer-mismatch' | 'endpoint-refused') {
    super(message)
    this.name = 'DiscoveryError'
  }
}

const trimSlash = (v: string) => v.replace(/\/$/, '')

/**
 * Discovery, with the document treated as what it is: a tenant-controlled
 * input one layer down from the issuer URL.
 *
 * - The document's `issuer` MUST equal the configured one (OIDC Discovery
 *   §4.3): a host serving a document that claims another issuer would have
 *   that issuer's tokens accepted for a connection nobody configured for it.
 * - Every endpoint the document names goes through the same `outboundUrl`
 *   rule the screening callback and webhooks use (HTTPS, no credentials,
 *   loopback only outside production) — otherwise Kleym's own process would
 *   POST the client secret, the code and the verifier wherever the document
 *   said. Checked here, so it holds at save time AND on every flow, since the
 *   document can change after the connection was saved.
 */
export async function discover(issuer: string, fetchImpl: typeof fetch = fetch, nodeEnv = process.env.NODE_ENV ?? 'development'): Promise<Discovery> {
  const rule = outboundUrlFor(nodeEnv)
  if (!rule.safeParse(issuer).success) throw new DiscoveryError('issuer is not a URL Kleym will call', 'endpoint-refused')
  const cacheKey = `${nodeEnv}\0${issuer}`
  const cached = discoveryCache.get(cacheKey)
  if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.doc
  const url = `${trimSlash(issuer)}/.well-known/openid-configuration`
  let response: Response
  try {
    response = await outboundFetch(url, { signal: AbortSignal.timeout(5000) }, fetchImpl, nodeEnv)
  } catch {
    throw new DiscoveryError('discovery request failed or was refused', 'unreachable')
  }
  if (!response.ok) throw new DiscoveryError(`discovery failed: HTTP ${response.status}`, 'unreachable')
  const doc = (await response.json().catch(() => ({}))) as Partial<Discovery>
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri || !doc.issuer) throw new DiscoveryError('discovery document incomplete', 'incomplete')
  if (trimSlash(doc.issuer) !== trimSlash(issuer)) throw new DiscoveryError('discovery document issuer does not match configuration', 'issuer-mismatch')
  for (const [name, endpoint] of [['authorization_endpoint', doc.authorization_endpoint], ['token_endpoint', doc.token_endpoint], ['jwks_uri', doc.jwks_uri], ['userinfo_endpoint', doc.userinfo_endpoint]] as const) {
    if (endpoint !== undefined && !rule.safeParse(endpoint).success) throw new DiscoveryError(`${name} is not a URL Kleym will call`, 'endpoint-refused')
  }
  const checked: Discovery = { issuer: doc.issuer, authorization_endpoint: doc.authorization_endpoint, token_endpoint: doc.token_endpoint, jwks_uri: doc.jwks_uri, ...(doc.userinfo_endpoint ? { userinfo_endpoint: doc.userinfo_endpoint } : {}) }
  discoveryCache.set(cacheKey, { at: Date.now(), doc: checked })
  return checked
}

/** For tests and the settings form: forget what was discovered for an issuer. */
export function forgetDiscovery(issuer: string): void {
  for (const key of discoveryCache.keys()) if (key.endsWith(`\0${issuer}`)) discoveryCache.delete(key)
}

export type FlowPurpose = 'login' | 'link'

interface Flow {
  connectionId: string
  purpose: FlowPurpose
  nonce: string
  verifier: string
  /** For `link`: the signed-in user the identity is for. */
  userId?: string
}

const flowKey = (state: string) => `sso:flow:${createHash('sha256').update(state).digest('hex')}`

export function redirectUri(): string {
  return `${env.APP_URL.replace(/\/$/, '')}/api/auth/sso/callback`
}

/** The IdP URL to send the browser to. State, nonce and verifier live in Redis until the callback. */
export async function beginAuthorization(connection: OidcConnection, purpose: FlowPurpose, userId?: string, fetchImpl: typeof fetch = fetch): Promise<{ url: string; state: string }> {
  const doc = await discover(connection.issuer, fetchImpl)
  const state = randomBytes(24).toString('base64url')
  const nonce = randomBytes(24).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const flow: Flow = { connectionId: connection.id, purpose, nonce, verifier, ...(userId ? { userId } : {}) }
  await redis.set(flowKey(state), JSON.stringify(flow), 'EX', FLOW_TTL_SECONDS)
  const url = new URL(doc.authorization_endpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', connection.clientId)
  url.searchParams.set('redirect_uri', redirectUri())
  url.searchParams.set('scope', connection.scopes)
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return { url: url.toString(), state }
}

export interface IdentityClaims {
  subject: string
  email: string | null
  emailVerified: boolean
  name: string | null
  groups: string[]
  /** Every claim, for the role mapping and nothing else; never logged whole. */
  raw: JWTPayload
}

export type CallbackResult =
  | { ok: true; flow: Flow; claims: IdentityClaims }
  | { ok: false; reason: 'no-flow' | 'exchange-failed' | 'invalid-token' | 'no-subject' }

/**
 * Consumes the flow, exchanges the code, verifies the ID token. Returns
 * claims — never the tokens.
 */
export async function completeAuthorization(
  loadConnection: (id: string) => Promise<OidcConnection | null>,
  params: { code: string; state: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CallbackResult> {
  const key = flowKey(params.state)
  const stored = await redis.get(key)
  if (stored) await redis.del(key) // one use, whatever happens next
  if (!stored) return { ok: false, reason: 'no-flow' }
  const flow = JSON.parse(stored) as Flow
  const connection = await loadConnection(flow.connectionId)
  if (!connection) return { ok: false, reason: 'no-flow' }

  let doc: Discovery
  try {
    doc = await discover(connection.issuer, fetchImpl)
  } catch (error) {
    logger.warn({ connectionId: connection.id, reason: error instanceof Error ? error.message : 'unknown' }, 'sso: discovery refused at callback')
    return { ok: false, reason: 'exchange-failed' }
  }
  let tokens: { id_token?: string; access_token?: string }
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: redirectUri(),
      client_id: connection.clientId,
      client_secret: decryptAtRest(connection.clientCiphertext),
      code_verifier: flow.verifier,
    })
    const response = await outboundFetch(doc.token_endpoint, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: body.toString(), signal: AbortSignal.timeout(10_000), redirect: 'error',
    }, fetchImpl)
    if (!response.ok) {
      logger.warn({ connectionId: connection.id, status: response.status }, 'sso: token exchange refused')
      return { ok: false, reason: 'exchange-failed' }
    }
    tokens = (await response.json()) as { id_token?: string; access_token?: string }
  } catch {
    logger.warn({ connectionId: connection.id, reason: 'destination or transport failure' }, 'sso: token exchange failed')
    return { ok: false, reason: 'exchange-failed' }
  }
  if (!tokens.id_token) return { ok: false, reason: 'invalid-token' }

  let payload: JWTPayload
  try {
    const jwks = createRemoteJWKSet(new URL(doc.jwks_uri), { [customFetch]: (url, init) => outboundFetch(url, init, fetchImpl) })
    // Against the CONFIGURED issuer — discover() has already required the document to agree.
    const verified = await jwtVerify(tokens.id_token, jwks, { issuer: [connection.issuer, trimSlash(connection.issuer), `${trimSlash(connection.issuer)}/`], audience: connection.clientId, clockTolerance: 60 })
    payload = verified.payload
  } catch {
    logger.warn({ connectionId: connection.id, reason: 'verification or destination failure' }, 'sso: id token rejected')
    return { ok: false, reason: 'invalid-token' }
  }
  if (payload.nonce !== flow.nonce) return { ok: false, reason: 'invalid-token' }

  // Groups may come only from userinfo (Google, some Okta setups). One call, then the access token is gone.
  let extra: Record<string, unknown> = {}
  if (doc.userinfo_endpoint && tokens.access_token && !(connection.groupsClaim in payload)) {
    try {
      const response = await outboundFetch(doc.userinfo_endpoint, { headers: { authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(5000) }, fetchImpl)
      if (response.ok) {
        const info = (await response.json()) as Record<string, unknown>
        // OIDC Core §5.3.2: the userinfo `sub` MUST match the ID token's; otherwise it is not this user's.
        if (info.sub === payload.sub) extra = info
        else logger.warn({ connectionId: connection.id }, 'sso: userinfo sub does not match the id token; ignored')
      }
    } catch {
      /* groups unavailable this time; the mapping falls back to the default role */
    }
  }
  tokens = {} // dropped, deliberately, before anything else happens

  const merged: Record<string, unknown> = { ...extra, ...payload }
  const subject = merged[connection.subjectClaim]
  if (typeof subject !== 'string' || subject.length === 0) return { ok: false, reason: 'no-subject' }
  const groupsRaw = merged[connection.groupsClaim]
  const groups = Array.isArray(groupsRaw) ? groupsRaw.filter((g): g is string => typeof g === 'string') : []
  return {
    ok: true,
    flow,
    claims: {
      subject,
      email: typeof merged.email === 'string' ? merged.email : null,
      emailVerified: merged.email_verified === true,
      name: typeof merged.name === 'string' ? merged.name : null,
      groups,
      raw: payload,
    },
  }
}
