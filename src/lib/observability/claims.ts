/**
 * The claim path, observed. Issue #53.
 *
 * Each phase runs in its own span and counts its outcome, so a slow ledger
 * failing the boundary wait shows as `submit` / `unavailable` rather than as
 * a generic error rate. The span carries the phase and the outcome and
 * NOTHING that identifies the link: no ephemeral key, no recipient, no
 * envelope, no fragment (the allowlist would drop them anyway).
 */
import { recordClaimOutcome, type ClaimPhase } from './metrics'
import { annotateSpan, withSpan, SpanKind } from './tracing'

/** How a result reads as an outcome label: `kind` for Outcome<T>, `status` for a resolved link. */
function outcomeOf(result: unknown): string {
  if (result && typeof result === 'object') {
    const r = result as { kind?: string; status?: string }
    if (typeof r.kind === 'string') return r.kind
    if (typeof r.status === 'string') return r.status
  }
  return 'ok'
}

export function observedClaim<A extends unknown[], R>(phase: ClaimPhase, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args: A) =>
    withSpan(`claim.${phase}`, { phase }, async () => {
      try {
        const result = await fn(...args)
        const outcome = outcomeOf(result)
        recordClaimOutcome(phase, outcome)
        annotateSpan({ outcome })
        return result
      } catch (error) {
        recordClaimOutcome(phase, 'error')
        annotateSpan({ outcome: 'error' })
        throw error
      }
    }, { kind: SpanKind.SERVER })
}
