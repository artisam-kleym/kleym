'use client'

/**
 * The `/claim` state machine. SPEC.md §5.1.
 *
 * Kept out of the component so the transitions are testable on their own, and
 * so "every state has a designed screen" is checkable against a list rather
 * than against a render tree.
 *
 * The shape follows the two-transaction claim the #1 spike proved (SPEC.md
 * §3.3), which the original issue text predates: there is a wait of roughly one
 * ledger between TX1 and TX2, and a failed TX2 is retryable WITHOUT redoing
 * TX1 — the ephemeral account is already materialised, so restarting from
 * scratch would strand a second set of reserves.
 */
import 'client-only'
import { CLAIM_CONFLICT_TYPE } from './problem-types'

export type ClaimState =
  | 'loading'
  | 'invalid'
  | 'ready'
  | 'otp_required'
  | 'wallet_connecting'
  | 'preparing'
  | 'materialising'
  | 'awaiting_ledger'
  | 'awaiting_signature'
  | 'submitting'
  | 'claimed_success'
  | 'already_claimed'
  | 'expired'
  | 'failed'

/** Every state SPEC.md §5.1 names, plus the two the two-transaction design adds. */
export const CLAIM_STATES: readonly ClaimState[] = [
  'loading',
  'invalid',
  'ready',
  'otp_required',
  'wallet_connecting',
  'preparing',
  'materialising',
  'awaiting_ledger',
  'awaiting_signature',
  'submitting',
  'claimed_success',
  'already_claimed',
  'expired',
  'failed',
] as const

/** States from which nothing further happens without a new page load. */
export const TERMINAL_STATES: readonly ClaimState[] = [
  'invalid',
  'claimed_success',
  'already_claimed',
  'expired',
] as const

export function isTerminal(state: ClaimState): boolean {
  return TERMINAL_STATES.includes(state)
}

/**
 * Where `failed` retries to.
 *
 * NOT `ready`. TX1 has already landed by the time TX2 can fail, and the
 * ephemeral account it created is sponsored by Kleym — restarting the whole
 * flow would materialise a second account and strand the first's reserves
 * (SPEC.md §3.3.2), which Kleym cannot recover. Retry resumes at TX2.
 */
export function retryTarget(materialised: boolean): ClaimState {
  return materialised ? 'preparing' : 'ready'
}

/**
 * Which state a `/api/claims/*` failure means.
 *
 * `resolve` is deliberately uniform — unknown, expired and claimed all answer
 * identically (SPEC.md §6.4), so the page cannot tell them apart up front and
 * shows `invalid`. The specific reason arrives from `prepare`, which the
 * recipient reaches only by acting on the link they hold. That split is the
 * point: a passer-by learns nothing, and the person holding the link is told
 * what happened.
 *
 * The reason is read from problem+json's `type`, never from the `detail`
 * prose. Both sides import the URIs from lib/claim/problem-types.ts, so a
 * rewording on the server cannot silently unwire the expired and
 * already-claimed screens (§5.1: every state has a designed screen).
 */
export function stateFromProblem(status: number, type: string | null): ClaimState {
  if (status === 404) return 'invalid'
  if (status === 409 && type) {
    if (type === CLAIM_CONFLICT_TYPE.expired) return 'expired'
    if (type === CLAIM_CONFLICT_TYPE['already-claimed']) return 'already_claimed'
  }
  return 'failed'
}

/**
 * Whether a `prepare/claim` refusal means only that TX1 has not reached the
 * ledger yet. §3.3.1 says the boundary is the ledger, not the clock, so the
 * page answers this by asking again rather than by having slept long enough.
 */
export function isNotReady(status: number, type: string | null): boolean {
  return status === 409 && type === CLAIM_CONFLICT_TYPE['not-ready']
}
