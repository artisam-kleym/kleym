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
export type ClaimConflictReason = 'expired' | 'already-claimed' | 'not-ready' | 'otp-required' | 'no-path' | 'quote-missed' | 'code-required' | 'passkey-required' | 'email-only'

export const CLAIM_CONFLICT_TYPE: Record<ClaimConflictReason, string> = {
  expired: `${CLAIM_PROBLEM_BASE}/conflict/expired`,
  'already-claimed': `${CLAIM_PROBLEM_BASE}/conflict/already-claimed`,
  /** TX1 has not reached the ledger yet; retrying `prepare/claim` is the fix. */
  'not-ready': `${CLAIM_PROBLEM_BASE}/conflict/not-ready`,
  /** An emailed link without a valid OTP token on the request. SPEC.md §6.4. */
  'otp-required': `${CLAIM_PROBLEM_BASE}/conflict/otp-required`,
  /** Receive-as (#74): no path prices the link's asset into the one asked for. The original asset is still there. */
  'no-path': `${CLAIM_PROBLEM_BASE}/conflict/no-path`,
  /** Receive-as (#74): the book moved past `destMin` between quote and ledger; refused rather than filled. */
  'quote-missed': `${CLAIM_PROBLEM_BASE}/conflict/quote-missed`,
  /** CODE policy (#79): no valid claim-code token on the request. */
  'code-required': `${CLAIM_PROBLEM_BASE}/conflict/code-required`,
  /** PASSKEY policy (#79): no valid passkey token on the request. */
  'passkey-required': `${CLAIM_PROBLEM_BASE}/conflict/passkey-required`,
  /** EMAIL policy (#79) on a link Kleym never emailed: nothing the holder can do here. */
  'email-only': `${CLAIM_PROBLEM_BASE}/conflict/email-only`,
}

/** The undiscriminated 409, for conflicts no screen distinguishes. */
export const CLAIM_CONFLICT_GENERIC = `${CLAIM_PROBLEM_BASE}/conflict`
