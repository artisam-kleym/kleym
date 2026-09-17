import { describe, expect, it } from 'vitest'
import { Claimant, Keypair, xdr } from '@stellar/stellar-sdk'
import { claimantsFor } from '@/lib/stellar/batch'
import { outstandingValue, suspensionDecision } from '@/lib/api/suspend'

const DAY = 86_400_000
const NOW = new Date('2026-09-17T12:00:00Z')
const LATER = new Date(NOW.getTime() + 7 * DAY)
const EARLIER = new Date(NOW.getTime() - DAY)

const campaign = (over: Partial<{ status: string; expiresAt: Date; suspendedAt: Date | null }> = {}) => ({
  status: 'ACTIVE',
  expiresAt: LATER,
  suspendedAt: null,
  ...over,
})

describe('suspensionDecision', () => {
  it.each(['ACTIVE', 'PARTIAL', 'CREATING'])('allows a %s campaign whose funds may be on the ledger', (status) => {
    expect(suspensionDecision(campaign({ status }), NOW)).toEqual({ kind: 'ok' })
  })

  it('sends a draft to cancel — there is nothing on the ledger to be honest about', () => {
    const decision = suspensionDecision(campaign({ status: 'DRAFT' }), NOW)
    expect(decision.kind).toBe('refuse')
    if (decision.kind === 'refuse') expect(decision.reason).toBe('draft')
  })

  it.each(['EXPIRED', 'RECLAIMED', 'CANCELLED'])('refuses a %s campaign as settled', (status) => {
    const decision = suspensionDecision(campaign({ status }), NOW)
    expect(decision.kind).toBe('refuse')
    if (decision.kind === 'refuse') expect(decision.reason).toBe('settled')
  })

  it('refuses once expiresAt has passed, whatever the row says — reclaim is the action then', () => {
    // The sweep is hourly, so an ACTIVE row can outlive its expiry by up to an hour.
    const decision = suspensionDecision(campaign({ expiresAt: EARLIER }), NOW)
    expect(decision.kind).toBe('refuse')
    if (decision.kind === 'refuse') expect(decision.reason).toBe('expired')
  })

  it('treats a second suspension as already done, not as an error', () => {
    const decision = suspensionDecision(campaign({ suspendedAt: EARLIER }), NOW)
    expect(decision).toEqual({ kind: 'already' })
  })
})

describe('outstandingValue', () => {
  it('multiplies with Decimal, never Number (AGENT.md §4.1)', () => {
    // 0.1 * 3 in binary floating point is 0.30000000000000004.
    expect(outstandingValue(3, '0.1000000')).toBe('0.3')
    expect(outstandingValue(7, '0.0000001')).toBe('0.0000007')
    expect(outstandingValue(0, '500')).toBe('0')
  })

  it('renders one stroop as a decimal, not an exponent', () => {
    expect(outstandingValue(1, '0.0000001')).toBe('0.0000001')
  })
})

/*
 * Acceptance criterion 6 of #72.
 *
 * Suspension is a database flag. It writes nothing to the ledger, so the
 * claimants on every balance are exactly what `claimantsFor` wrote at batch
 * time. This pins what those claimants PERMIT: before expiry the recipient's
 * predicate is satisfied and the sender's is not, so a "cancelled" campaign's
 * funds are still claimable by anyone holding the link. If someone later makes
 * suspension actually revoke, this test is the one that must change — and it
 * should, deliberately, with the product decision the issue asks for.
 */
describe('a suspended campaign is still claimable by the recipient until expiry', () => {
  const recipient = Keypair.random().publicKey()
  const sender = Keypair.random().publicKey()
  const [toRecipient, toSender] = claimantsFor(recipient, sender, LATER)

  /** Evaluates an absolute-time predicate pair the way the network does. */
  function satisfied(predicate: xdr.ClaimPredicate, at: Date): boolean {
    switch (predicate.switch().name) {
      case 'claimPredicateBeforeAbsoluteTime':
        return Math.floor(at.getTime() / 1000) < Number(predicate.absBefore().toString())
      case 'claimPredicateNot':
        return !satisfied(predicate.notPredicate()!, at)
      default:
        throw new Error(`unexpected predicate ${predicate.switch().name}`)
    }
  }

  it('the recipient can claim and the sender cannot, at every instant before expiresAt', () => {
    for (const at of [NOW, new Date(LATER.getTime() - 1000)]) {
      expect(satisfied(toRecipient!.predicate, at)).toBe(true)
      expect(satisfied(toSender!.predicate, at)).toBe(false)
    }
  })

  it('only at expiresAt does the sender gain the balance — which is why the reclaim is scheduled there', () => {
    expect(satisfied(toRecipient!.predicate, LATER)).toBe(false)
    expect(satisfied(toSender!.predicate, LATER)).toBe(true)
  })

  it('there is no third claimant that could make suspension a revocation', () => {
    expect(claimantsFor(recipient, sender, LATER)).toHaveLength(2)
    expect(toRecipient!.destination).toBe(recipient)
    expect(Claimant.predicateNot(toRecipient!.predicate).toXDR('base64')).toBe(toSender!.predicate.toXDR('base64'))
  })
})
