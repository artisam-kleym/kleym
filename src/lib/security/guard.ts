/**
 * Boundary guard applied by every route handler that accepts a body.
 *
 * Order matters: the seed scan runs BEFORE Zod parsing, so a seed in a field
 * the schema would strip as unknown is still caught. Rejecting unknown keys is
 * not the same as never having seen them.
 */
import { randomUUID } from 'node:crypto'
import { findSecretSeed } from '@/lib/validation/stellar'
import { recordSecurityEvent, seedSubmittedProblem } from './events'

export interface GuardFailure {
  response: Response
}

export function guardRequestBody(
  body: unknown,
  context: { route: string; ip: string | null },
): GuardFailure | null {
  const seedPath = findSecretSeed(body)
  if (seedPath) {
    const correlationId = randomUUID()
    recordSecurityEvent({
      type: 'SEED_SUBMITTED',
      route: context.route,
      field: seedPath.join('.') || '(root)',
      ip: context.ip,
    })
    return { response: seedSubmittedProblem(correlationId) }
  }
  return null
}

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded ? (forwarded.split(',')[0]?.trim() ?? null) : null
}
