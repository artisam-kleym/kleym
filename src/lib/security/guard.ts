/**
 * Boundary guard applied by every route handler that accepts a body.
 *
 * Order matters: the seed scan runs BEFORE Zod parsing, so a seed in a field
 * the schema would strip as unknown is still caught. Rejecting unknown keys is
 * not the same as never having seen them.
 */
import { randomUUID } from 'node:crypto'
import { scanForSecretSeed } from '@/lib/validation/stellar'
import { bodyTooDeepProblem, recordSecurityEvent, seedSubmittedProblem } from './events'

export interface GuardFailure {
  response: Response
}

export function guardRequestBody(
  body: unknown,
  context: { route: string; ip: string | null },
): GuardFailure | null {
  const result = scanForSecretSeed(body)

  if (result.outcome === 'seed') {
    const correlationId = randomUUID()
    recordSecurityEvent({
      type: 'SEED_SUBMITTED',
      route: context.route,
      field: result.path.join('.') || '(root)',
      ip: context.ip,
    })
    return { response: seedSubmittedProblem(correlationId) }
  }

  if (result.outcome === 'too-deep') {
    // Rejected, but NOT a security event: reporting this as SEED_SUBMITTED
    // would let anyone flood the security log with a nested JSON body.
    return { response: bodyTooDeepProblem() }
  }

  return null
}
