/**
 * Security events. AGENT.md §5.4 requires a seed submission to be logged as
 * one, not merely rejected.
 *
 * The offending VALUE is never recorded — only that it happened, and where.
 * Logging the seed to prove a seed was logged would be the same defect.
 */
import { logger } from '@/lib/config/logger'

export type SecurityEvent =
  | { type: 'SEED_SUBMITTED'; route: string; field: string; ip: string | null }
  | { type: 'INVALID_STELLAR_KEY'; route: string; field: string; ip: string | null }

export function recordSecurityEvent(event: SecurityEvent): void {
  // Named fields only — allowlist logging per AGENT.md §4.5. Never spread the
  // request or the parsed body in here.
  logger.warn(
    {
      securityEvent: event.type,
      route: event.route,
      field: event.field,
      ip: event.ip ?? undefined,
    },
    `security event: ${event.type}`,
  )
}

/** RFC 9457 problem+json for a rejected seed. AGENT.md §4.4. */
export function seedSubmittedProblem(correlationId: string): Response {
  return new Response(
    JSON.stringify({
      type: 'https://kleym.app/problems/seed-submitted',
      title: 'Secret seed submitted',
      status: 400,
      // Deliberately does not echo the offending value or its location in a way
      // that would reproduce it.
      detail:
        'A Stellar secret seed was found in this request. Kleym never accepts secret keys; ' +
        'only public keys (G…) may be sent to the server.',
      correlationId,
    }),
    { status: 400, headers: { 'content-type': 'application/problem+json' } },
  )
}

/** Structurally implausible body. Rejected, but not a security event. */
export function bodyTooDeepProblem(): Response {
  return new Response(
    JSON.stringify({
      type: 'https://kleym.app/problems/malformed-body',
      title: 'Request body too deeply nested',
      status: 400,
      detail: 'The request body exceeds the maximum supported nesting depth.',
    }),
    { status: 400, headers: { 'content-type': 'application/problem+json' } },
  )
}
