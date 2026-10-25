/**
 * Problem responses for the public claim endpoints. AGENT.md §4.4.
 *
 * Separate from lib/api/problems.ts because these are UNAUTHENTICATED and
 * facing a recipient rather than a sender: the detail has to be something a
 * person who received a link can act on, and must never describe Kleym's
 * internals to someone probing the keyspace.
 */
import { randomUUID } from 'node:crypto'
import {
  CLAIM_CONFLICT_GENERIC,
  CLAIM_CONFLICT_TYPE,
  CLAIM_PROBLEM_BASE as BASE,
  type ClaimConflictReason,
} from '@/lib/claim/problem-types'

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

/**
 * 409. `reason` becomes the `type` discriminator the claim page switches on
 * (lib/claim/problem-types.ts); without one the conflict is generic.
 */
export function claimConflict(detail: string, reason?: ClaimConflictReason): Response {
  return problem(
    {
      type: reason ? CLAIM_CONFLICT_TYPE[reason] : CLAIM_CONFLICT_GENERIC,
      title: 'Cannot claim',
      status: 409,
      detail,
      correlationId: randomUUID(),
    },
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

/*
 * Recipient limits remain tight. Aggregate IP budgets are separate so an
 * event's shared Wi-Fi does not give every attendee one combined allowance.
 *
 * Per IP alone is not enough: an attacker with a forwarded email and a pool of
 * addresses would still get unlimited attempts against one recipient. Per link
 * alone is not enough either: one host could then sweep many links at once.
 * SPEC.md §6.4 caps guesses at five, and these caps stop the REQUEST endpoint
 * being used to mail a recipient repeatedly.
 */
export const OTP_REQUEST_LIMIT = { limit: 3, windowSeconds: 15 * 60 } as const
export const OTP_VERIFY_LIMIT = { limit: 10, windowSeconds: 15 * 60 } as const
export const OTP_REQUEST_IP_LIMIT = { limit: 300, windowSeconds: 15 * 60 } as const
export const OTP_VERIFY_IP_LIMIT = { limit: 600, windowSeconds: 15 * 60 } as const
