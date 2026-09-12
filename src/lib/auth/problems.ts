/** RFC 9457 responses for auth. AGENT.md §4.4 — no stack traces, no internals. */
import { randomUUID } from 'node:crypto'

function problem(body: Record<string, unknown>, status: number, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json', ...headers },
  })
}

/**
 * ONE response for every failed login.
 *
 * AGENT.md §5.1 requires identical error text for unknown username and wrong
 * password. It must also be identical for a locked-out account and a
 * deactivated one — otherwise the differences become an oracle for which
 * usernames exist and which are currently under attack.
 *
 * No correlationId either: a per-response identifier makes two failures
 * distinguishable byte-for-byte even when the text matches.
 */
export function invalidCredentials(): Response {
  return problem(
    {
      type: 'https://kleym.app/problems/invalid-credentials',
      title: 'Invalid credentials',
      status: 401,
      detail: 'That username and password combination was not recognised.',
    },
    401,
  )
}

export function tooManyAttempts(retryAfterSeconds: number): Response {
  return problem(
    {
      type: 'https://kleym.app/problems/too-many-attempts',
      title: 'Too many attempts',
      status: 429,
      detail: 'Too many sign-in attempts. Try again later.',
    },
    429,
    { 'retry-after': String(retryAfterSeconds) },
  )
}

export function unauthenticated(): Response {
  return problem(
    {
      type: 'https://kleym.app/problems/unauthenticated',
      title: 'Not signed in',
      status: 401,
      detail: 'This endpoint requires an active session.',
    },
    401,
  )
}

export function invalidRequest(errors: { path: string; message: string }[]): Response {
  return problem(
    {
      type: 'https://kleym.app/problems/validation',
      title: 'Invalid request',
      status: 400,
      errors,
    },
    400,
  )
}

export function serverError(): Response {
  const correlationId = randomUUID()
  return problem(
    {
      type: 'https://kleym.app/problems/internal',
      title: 'Something went wrong',
      status: 500,
      detail: 'Quote this identifier to support.',
      correlationId,
    },
    500,
  )
}

/** Password sign-in is off for this account's organisation (#46). Sign in through the IdP. */
export function ssoRequired(): Response {
  return new Response(
    JSON.stringify({ type: 'https://kleym.app/problems/sso-required', title: 'Sign in with your organisation', status: 403, detail: 'Password sign-in is disabled for your organisation. Use single sign-on.' }),
    { status: 403, headers: { 'content-type': 'application/problem+json' } },
  )
}
