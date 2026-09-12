/**
 * The `type` URIs the claim endpoints put on a 409, and the ONE place both
 * sides of that contract import from.
 *
 * `/claim` has designed screens for two of its conflicts — expired and
 * already claimed (SPEC.md §5.1) — and used to reach them by matching the
 * `detail` prose. A copy-edit to either sentence would have left both screens
 * unreachable with every test green. problem+json has a discriminator for
 * exactly this, so the reason travels in `type` and the prose is free to change.
 *
 * No `client-only` / `server-only` here: the server emits these and the page
 * matches on them, and that is the point.
 */

export const CLAIM_PROBLEM_BASE = 'https://kleym.app/problems'

/** A conflict the page can name. Anything else is a generic `failed`. */
export type ClaimConflictReason = 'expired' | 'already-claimed' | 'not-ready'

export const CLAIM_CONFLICT_TYPE: Record<ClaimConflictReason, string> = {
  expired: `${CLAIM_PROBLEM_BASE}/conflict/expired`,
  'already-claimed': `${CLAIM_PROBLEM_BASE}/conflict/already-claimed`,
  /** TX1 has not reached the ledger yet; retrying `prepare/claim` is the fix. */
  'not-ready': `${CLAIM_PROBLEM_BASE}/conflict/not-ready`,
}

/** The undiscriminated 409, for conflicts no screen distinguishes. */
export const CLAIM_CONFLICT_GENERIC = `${CLAIM_PROBLEM_BASE}/conflict`
