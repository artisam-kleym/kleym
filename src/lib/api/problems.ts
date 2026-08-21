/**
 * RFC 9457 problem+json. AGENT.md §4.4.
 *
 * Never a stack trace, a SQL fragment, or an internal identifier. Failures
 * carry a correlation ID so support can find the server-side log line without
 * the client ever seeing what went wrong.
 */
import { randomUUID } from 'node:crypto'

const BASE = 'https://kleym.app/problems'

function problem(
  body: Record<string, unknown>,
  status: number,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json', ...headers },
  })
}

export function validationProblem(errors: { path: string; message: string }[]): Response {
  return problem({ type: `${BASE}/validation`, title: 'Invalid request', status: 400, errors }, 400)
}

/**
 * 404, NOT 403, for a campaign owned by someone else.
 *
 * "Forbidden" confirms the id exists, which turns the endpoint into an
 * enumeration oracle. Ownership is enforced in the query (AGENT.md §5.4), so a
 * miss and a foreign row are indistinguishable by construction rather than by
 * a check we might forget.
 */
export function notFound(): Response {
  return problem(
    { type: `${BASE}/not-found`, title: 'Not found', status: 404, detail: 'No such campaign.' },
    404,
  )
}

export function conflict(detail: string): Response {
  return problem({ type: `${BASE}/conflict`, title: 'Conflict', status: 409, detail }, 409)
}

export function unauthenticated(): Response {
  return problem(
    {
      type: `${BASE}/unauthenticated`,
      title: 'Not signed in',
      status: 401,
      detail: 'This endpoint requires an active session.',
    },
    401,
  )
}

export function idempotencyKeyRequired(): Response {
  return problem(
    {
      type: `${BASE}/idempotency-key-required`,
      title: 'Idempotency-Key required',
      status: 400,
      detail:
        'This endpoint changes chain-affecting state and requires an Idempotency-Key header ' +
        'so a retry cannot execute twice.',
    },
    400,
  )
}

export function serverError(): Response {
  const correlationId = randomUUID()
  return problem(
    {
      type: `${BASE}/internal`,
      title: 'Something went wrong',
      status: 500,
      detail: 'Quote this identifier to support.',
      correlationId,
    },
    500,
  )
}

export { randomUUID }
