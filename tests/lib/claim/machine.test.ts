/**
 * The claim state machine. SPEC.md §5.1, §3.3.
 */
import { describe, expect, it } from 'vitest'
import {
  CLAIM_STATES,
  TERMINAL_STATES,
  isTerminal,
  retryTarget,
  stateFromProblem,
} from '@/lib/claim/machine'

describe('the state list', () => {
  // SPEC.md §5.1 names twelve; the two-transaction design (§3.3) adds the
  // ledger wait and the TX1 signature, which have their own screens.
  const SPEC_STATES = [
    'loading', 'invalid', 'ready', 'otp_required', 'wallet_connecting',
    'preparing', 'awaiting_signature', 'submitting', 'claimed_success',
    'already_claimed', 'expired', 'failed',
  ]

  it('covers every state SPEC.md §5.1 names', () => {
    for (const state of SPEC_STATES) expect(CLAIM_STATES).toContain(state)
  })

  it('adds the two the two-transaction design needs', () => {
    expect(CLAIM_STATES).toContain('materialising')
    expect(CLAIM_STATES).toContain('awaiting_ledger')
  })

  it('has no duplicates', () => {
    expect(new Set(CLAIM_STATES).size).toBe(CLAIM_STATES.length)
  })

  it('marks exactly the states nothing follows', () => {
    expect([...TERMINAL_STATES].sort()).toEqual(
      ['already_claimed', 'claimed_success', 'expired', 'invalid'].sort(),
    )
    expect(isTerminal('ready')).toBe(false)
    expect(isTerminal('failed')).toBe(false) // failed retries
    expect(isTerminal('claimed_success')).toBe(true)
  })
})

/*
 * The retry target is a money question, not a UX one. TX1 has landed by the
 * time TX2 can fail, and the ephemeral account it created is sponsored by
 * Kleym. Restarting from `ready` would materialise a SECOND account and strand
 * the first's reserves, which SPEC.md §3.3.2 says Kleym cannot recover.
 */
describe('retry after a failure', () => {
  it('resumes at TX2 when TX1 has already landed', () => {
    expect(retryTarget(true)).toBe('preparing')
  })

  it('starts over only when nothing has been materialised', () => {
    expect(retryTarget(false)).toBe('ready')
  })
})

describe('reading a problem response', () => {
  it('maps 404 to invalid — resolve and prepare both use it for "no such link"', () => {
    expect(stateFromProblem(404, 'This link is not available.')).toBe('invalid')
  })

  it('recognises expiry', () => {
    expect(stateFromProblem(409, 'This link has expired. The funds return to the sender.')).toBe('expired')
  })

  it('recognises an already-claimed link', () => {
    expect(stateFromProblem(409, 'This link has already been claimed.')).toBe('already_claimed')
  })

  it('falls back to failed for anything else, including a bare 409', () => {
    expect(stateFromProblem(409, 'Stellar rejected the transaction: tx_bad_seq.')).toBe('failed')
    expect(stateFromProblem(409, null)).toBe('failed')
    expect(stateFromProblem(503, 'Claims are temporarily unavailable.')).toBe('failed')
    expect(stateFromProblem(500, null)).toBe('failed')
  })

  // 503 is sponsor exhaustion — temporary and retryable, so it must land on a
  // state with a retry action rather than a terminal one.
  it('leaves a retry available for a temporary failure', () => {
    expect(isTerminal(stateFromProblem(503, 'Claims are temporarily unavailable.'))).toBe(false)
  })
})
