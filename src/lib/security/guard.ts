/**
 * Boundary guard applied by every route handler that accepts a body.
 *
 * Order matters: the seed scan runs BEFORE Zod parsing, so a seed in a field
 * the schema would strip as unknown is still caught. Rejecting unknown keys is
 * not the same as never having seen them.
 */
import { randomUUID } from 'node:crypto'
import { scanForSecretSeed } from '@/lib/validation/stellar'
import { recordAudit } from '@/lib/api/audit'
import { bodyTooDeepProblem, bodyTooLongProblem, recordSecurityEvent, seedSubmittedProblem } from './events'

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
    /*
     * The security event goes to the LOG and to the audit table.
     *
     * A log line scrolls away and is read only if someone is already looking.
     * A seed reaching the server is exactly the thing someone will go looking
     * for afterwards, so it belongs in the table built for that.
     *
     * Fire-and-forget: this guard is synchronous by design — it runs before
     * anything else touches the request — and making every guarded route await
     * a database write to reject a bad body would be a cost paid on the happy
     * path too. A failed write is logged by recordAudit itself.
     */
    void recordAudit({
      userId: null,
      action: 'security.seed_submitted',
      entityType: 'route',
      entityId: context.route,
      // The FIELD PATH, never the value. That is the whole point.
      metadata: { field: result.path.join('.') || '(root)', correlationId },
      ip: context.ip,
    })

    return { response: seedSubmittedProblem(correlationId) }
  }

  if (result.outcome === 'too-deep') {
    // Rejected, but NOT a security event: reporting this as SEED_SUBMITTED
    // would let anyone flood the security log with a nested JSON body.
    return { response: bodyTooDeepProblem() }
  }

  if (result.outcome === 'too-long') {
    // Same reasoning (#77): a body of `zoo zoo zoo …` is refused for the CPU
    // it would cost, not recorded as a seed nobody submitted.
    return { response: bodyTooLongProblem() }
  }

  return null
}
