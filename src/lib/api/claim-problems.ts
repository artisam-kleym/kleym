/**
 * Problem responses for the public claim endpoints. AGENT.md §4.4.
 *
 * Separate from lib/api/problems.ts because these are UNAUTHENTICATED and
 * facing a recipient rather than a sender: the detail has to be something a
 * person who received a link can act on, and must never describe Kleym's
 * internals to someone probing the keyspace.
 */
import { randomUUID } from 'node:crypto'

const BASE = 'https://kleym.app/problems'

function problem(body: Record<string, unknown>, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json', ...headers },
  })
}

export function claimValidationProblem(errors: { path: string; message: string }[]): Response {
  return problem(
    { type: `${BASE}/validation`, title: 'Invalid request', status: 400, errors, correlationId: randomUUID() },
    400,
  )
}

/** 404 for every "no such claimable link", whatever the underlying reason. */
export function claimNotFound(): Response {
  return problem(
    {
      type: `${BASE}/not-found`,
      title: 'Not found',
      status: 404,
      detail: 'This link is not available.',
      correlationId: randomUUID(),
    },
    404,
  )
}

export function claimConflict(detail: string): Response {
  return problem(
    { type: `${BASE}/conflict`, title: 'Cannot claim', status: 409, detail, correlationId: randomUUID() },
    409,
  )
}

/** 503, not 500: sponsor exhaustion is temporary and the caller should retry. */
export function claimUnavailable(detail: string): Response {
  return problem(
    {
      type: `${BASE}/unavailable`,
      title: 'Temporarily unavailable',
      status: 503,
      detail,
      correlationId: randomUUID(),
    },
    503,
    { 'retry-after': '60' },
  )
}

export function claimRateLimited(retryAfterSeconds: number): Response {
  return problem(
    {
      type: `${BASE}/rate-limited`,
      title: 'Too many requests',
      status: 429,
      detail: 'Too many attempts. Wait a moment and try again.',
      correlationId: randomUUID(),
    },
    429,
    { 'retry-after': String(retryAfterSeconds) },
  )
}

export function claimServerError(): Response {
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

/** AGENT.md §5.6. */
export const RESOLVE_LIMIT = { limit: 20, windowSeconds: 60 } as const
export const MATERIALISE_LIMIT = { limit: 20, windowSeconds: 60 } as const
export const CLAIM_LIMIT = { limit: 10, windowSeconds: 60 } as const
export const SUBMIT_LIMIT = { limit: 10, windowSeconds: 60 } as const
