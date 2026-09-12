/**
 * The claim state machine. SPEC.md §5.1, §3.3.
 */
import { describe, expect, it } from 'vitest'
import {
  CLAIM_STATES,
  TERMINAL_STATES,
  isNotReady,
  isTerminal,
  retryTarget,
  stateFromProblem,
} from '@/lib/claim/machine'
import { claimConflict } from '@/lib/api/claim-problems'
import { CLAIM_CONFLICT_GENERIC, CLAIM_CONFLICT_TYPE } from '@/lib/claim/problem-types'

/** What the server actually puts on the wire for a given conflict reason. */
async function emitted(reason?: Parameters<typeof claimConflict>[1]) {
  const response = claimConflict('any prose at all', reason)
  const body = (await response.json()) as { type: string }
  return { status: response.status, type: body.type }
}

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
 *
 * The answer is what `run(from)` in claim-flow.tsx starts from — `preparing`
 * skips the wallet connect and TX1 — so this is the value that decides whether
 * TX1 is attempted again, not a label on a screen.
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
    expect(stateFromProblem(404, 'https://kleym.app/problems/not-found')).toBe('invalid')
  })

  /*
   * The screens are reached through the `type` discriminator, and these read
   * it from the SAME function the routes call — so a rewording of the detail
   * on the server cannot unwire a screen, and a change to the URI breaks here
   * rather than in a browser.
   */
  it('recognises expiry from what the server emits', async () => {
    const p = await emitted('expired')
    expect(stateFromProblem(p.status, p.type)).toBe('expired')
  })

  it('recognises an already-claimed link from what the server emits', async () => {
    const p = await emitted('already-claimed')
    expect(stateFromProblem(p.status, p.type)).toBe('already_claimed')
  })

  it('sends an emailed recipient back to the code screen when the gate refuses', async () => {
    const p = await emitted('otp-required')
    expect(stateFromProblem(p.status, p.type)).toBe('otp_required')
  })

  it('never reads the detail prose', () => {
    expect(stateFromProblem(409, 'This link has expired.')).toBe('failed')
    expect(stateFromProblem(409, 'This link has already been claimed.')).toBe('failed')
  })

  it('falls back to failed for anything else, including a bare 409', async () => {
    const generic = await emitted()
    expect(generic.type).toBe(CLAIM_CONFLICT_GENERIC)
    expect(stateFromProblem(generic.status, generic.type)).toBe('failed')
    expect(stateFromProblem(409, null)).toBe('failed')
    expect(stateFromProblem(503, 'https://kleym.app/problems/unavailable')).toBe('failed')
    expect(stateFromProblem(500, null)).toBe('failed')
  })

  // 503 is sponsor exhaustion — temporary and retryable, so it must land on a
  // state with a retry action rather than a terminal one.
  it('leaves a retry available for a temporary failure', () => {
    expect(isTerminal(stateFromProblem(503, 'https://kleym.app/problems/unavailable'))).toBe(false)
  })

  // Not-ready is a slow ledger, not a failure: the page asks again rather
  // than landing the recipient on `failed` with a message about waiting.
  it('tells a not-ready refusal apart from a real conflict', async () => {
    const notReady = await emitted('not-ready')
    expect(isNotReady(notReady.status, notReady.type)).toBe(true)
    expect(stateFromProblem(notReady.status, notReady.type)).toBe('failed')
    expect(isNotReady(409, CLAIM_CONFLICT_TYPE.expired)).toBe(false)
    expect(isNotReady(200, CLAIM_CONFLICT_TYPE['not-ready'])).toBe(false)
  })
})
