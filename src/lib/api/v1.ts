/**
 * The public API. SPEC.md §6.6.
 *
 * Read-only until #51, and the reason has not changed: creating a campaign
 * requires generating keypairs, and an endpoint that accepted them would
 * break the guarantee the product rests on (AGENT.md §1). What #51 adds is
 * a write path that never sees one — the SDK generates keys on the caller's
 * machine, writes the CSV to the caller's disk, and sends PUBLIC keys only;
 * batches are signed by the caller and arrive here signed. Every write
 * endpoint runs `guardRequestBody` before anything else, and CI checks that
 * each one does.
 */
import Decimal from 'decimal.js'
import { rateLimit } from '@/lib/auth/rate-limit'
import { resolveApiKey, touchApiKey, type ApiKeyCaller } from '@/lib/auth/api-key'
import { logger } from '@/lib/config/logger'
import { randomUUID } from 'node:crypto'
import { guardRequestBody } from '@/lib/security/guard'
import { clientIp } from '@/lib/auth/client-ip'

const BASE = 'https://kleym.app/problems'

/** AGENT.md §5.6. */
export const API_RATE_LIMIT = { limit: 100, windowSeconds: 60 } as const
/** Writes are counted separately and tighter (#51): a runaway integration cannot spend a key's read budget creating campaigns. */
export const API_WRITE_RATE_LIMIT = { limit: 30, windowSeconds: 60 } as const

function problem(body: Record<string, unknown>, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json', ...headers },
  })
}

/**
 * 401 for every authentication outcome — absent, malformed, wrong, revoked.
 *
 * Distinguishing them tells a caller which half of their guess was right.
 * `WWW-Authenticate` still names the scheme, which is what a client actually
 * needs to know.
 */
export function apiUnauthorised(): Response {
  return problem(
    {
      type: `${BASE}/unauthorised`,
      title: 'Invalid API key',
      status: 401,
      detail: 'Send a live key as `Authorization: Bearer <key>`.',
      correlationId: randomUUID(),
    },
    401,
    { 'www-authenticate': 'Bearer realm="kleym"' },
  )
}

export function apiRateLimited(retryAfterSeconds: number, limit: { limit: number } = API_RATE_LIMIT): Response {
  return problem(
    {
      type: `${BASE}/rate-limited`,
      title: 'Too many requests',
      status: 429,
      detail: `This key is limited to ${limit.limit} ${limit === API_RATE_LIMIT ? 'requests' : 'write requests'} per minute.`,
      correlationId: randomUUID(),
    },
    429,
    { 'retry-after': String(retryAfterSeconds) },
  )
}

/** 404, not 403 — see the note on `notFound` in lib/api/problems.ts. */
export function apiNotFound(): Response {
  return problem(
    {
      type: `${BASE}/not-found`,
      title: 'Not found',
      status: 404,
      detail: 'No such campaign.',
      correlationId: randomUUID(),
    },
    404,
  )
}

export function apiServerError(): Response {
  return problem(
    {
      type: `${BASE}/internal`,
      title: 'Something went wrong',
      status: 500,
      detail: 'Quote this identifier to support.',
      correlationId: randomUUID(),
    },
    500,
  )
}

/** 403, not 401: the key is real and live; it was issued without write scope. */
export function apiInsufficientScope(): Response {
  return problem(
    {
      type: `${BASE}/insufficient-scope`,
      title: 'Insufficient scope',
      status: 403,
      detail: 'This key was issued with read scope. Issue a key with write scope under Settings → API keys.',
      correlationId: randomUUID(),
    },
    403,
    { 'www-authenticate': 'Bearer realm="kleym", scope="write"' },
  )
}

export function apiConflict(detail: string): Response {
  return problem({ type: `${BASE}/conflict`, title: 'Conflict', status: 409, detail, correlationId: randomUUID() }, 409)
}

export function apiValidationProblem(errors: { path: string; message: string }[]): Response {
  return problem(
    { type: `${BASE}/validation`, title: 'Invalid request', status: 400, errors, correlationId: randomUUID() },
    400,
  )
}

export type ApiCallerResult =
  | { caller: ApiKeyCaller; response?: never; headers: Record<string, string> }
  | { caller?: never; response: Response; headers?: never }

/**
 * Shared preamble: authenticate, rate limit, record use.
 *
 * The limit is per KEY, not per user or per IP — a caller who wants more
 * throughput cannot get it by issuing a second key from the same account
 * without that being visible, and revoking one key does not punish another.
 */
export async function requireApiCaller(request: Request): Promise<ApiCallerResult> {
  const resolved = await resolveApiKey(request)
  if (!resolved.ok) return { response: apiUnauthorised() }

  const limit = await rateLimit(`apikey:${resolved.caller.keyId}`, API_RATE_LIMIT.limit, API_RATE_LIMIT.windowSeconds)
  if (!limit.allowed) return { response: apiRateLimited(limit.retryAfterSeconds) }

  try {
    await touchApiKey(resolved.caller.keyId)
  } catch (error) {
    // Bookkeeping. Refusing a request the caller is entitled to because
    // lastUsedAt failed to write would be the wrong trade.
    logger.warn(
      { keyId: resolved.caller.keyId, reason: error instanceof Error ? error.message : 'unknown' },
      'could not record API key use',
    )
  }

  return {
    caller: resolved.caller,
    headers: {
      'x-ratelimit-limit': String(API_RATE_LIMIT.limit),
      'x-ratelimit-remaining': String(limit.remaining),
    },
  }
}

/**
 * Amounts cross the boundary as STRINGS. AGENT.md §4.1.
 *
 * A JSON number is an IEEE 754 double, which cannot hold seven decimal places
 * exactly past a certain magnitude — `10000000.0000001` round-trips to
 * `10000000.000000101`. Every consumer of this API would inherit that.
 */
export function amount(value: unknown): string {
  return new Decimal(String(value)).toFixed()
}

export function jsonWithHeaders(body: unknown, headers: Record<string, string>, status = 200): Response {
  return Response.json(body, { headers, status })
}

export type ApiWriterResult =
  | { caller: ApiKeyCaller; body: unknown; response?: never; headers: Record<string, string> }
  | { caller?: never; body?: never; response: Response; headers?: never }

/**
 * The write preamble (#51): the read preamble, then the write limit, then the
 * body — parsed, and scanned for a seed BEFORE any schema sees it. A seed
 * anywhere in a write body is a security event, not a validation error.
 * Every v1 POST route calls this and CI checks the call is there.
 */
export async function requireApiWriter(request: Request, route: string): Promise<ApiWriterResult> {
  const auth = await requireApiCaller(request)
  if (!auth.caller) return { response: auth.response }
  // Scope before anything else touches the request: a READ key gets a 403 and no side effect.
  if (auth.caller.scope !== 'WRITE') return { response: apiInsufficientScope() }

  const limit = await rateLimit(`apikeywrite:${auth.caller.keyId}`, API_WRITE_RATE_LIMIT.limit, API_WRITE_RATE_LIMIT.windowSeconds)
  if (!limit.allowed) return { response: apiRateLimited(limit.retryAfterSeconds, API_WRITE_RATE_LIMIT) }

  let body: unknown = {}
  const text = await request.text()
  if (text.trim() !== '') {
    try {
      body = JSON.parse(text)
    } catch {
      return { response: apiValidationProblem([{ path: '', message: 'malformed JSON' }]) }
    }
  }
  const blocked = guardRequestBody(body, { route, ip: clientIp(request) })
  if (blocked) return { response: blocked.response }

  return { caller: auth.caller, body, headers: { ...auth.headers, 'x-ratelimit-write-limit': String(API_WRITE_RATE_LIMIT.limit), 'x-ratelimit-write-remaining': String(limit.remaining) } }
}
