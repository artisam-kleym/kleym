/**
 * One trace per claim page visit. Issue #53.
 *
 * The browser starts the trace and sends a W3C `traceparent` on every call
 * to /api/claims/*, so resolve, both prepares and the submit are one trace
 * on the server side. The trace id is random and carries nothing — not the
 * fragment, not the key, nothing derived from either. A new span id per
 * request keeps the server spans siblings under one root.
 */
import 'client-only'

function hex(bytes: number): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('')
}

let traceId: string | null = null

export function claimTraceId(): string {
  return (traceId ??= hex(16))
}

/** Headers to merge into a claim-path fetch. */
export function claimTraceHeaders(): Record<string, string> {
  return { traceparent: `00-${claimTraceId()}-${hex(8)}-01` }
}
