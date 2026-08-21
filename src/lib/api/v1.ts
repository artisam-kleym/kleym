/**
 * The public read-only API. SPEC.md §6.6.
 *
 * Read-only in v1, by design rather than by omission: creating a campaign
 * requires generating keypairs in a browser, and an endpoint that accepted them
 * server-side would break the guarantee the whole product rests on
 * (AGENT.md §1). There is no write path to add later without that changing.
 */
import Decimal from 'decimal.js'
import { rateLimit } from '@/lib/auth/rate-limit'
import { resolveApiKey, touchApiKey, type ApiKeyCaller } from '@/lib/auth/api-key'
import { logger } from '@/lib/config/logger'
import { randomUUID } from 'node:crypto'

const BASE = 'https://kleym.app/problems'

/** AGENT.md §5.6. */
export const API_RATE_LIMIT = { limit: 100, windowSeconds: 60 } as const

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

export function apiRateLimited(retryAfterSeconds: number): Response {
  return problem(
    {
      type: `${BASE}/rate-limited`,
      title: 'Too many requests',
      status: 429,
      detail: `This key is limited to ${API_RATE_LIMIT.limit} requests per minute.`,
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

export function jsonWithHeaders(body: unknown, headers: Record<string, string>): Response {
  return Response.json(body, { headers })
}
