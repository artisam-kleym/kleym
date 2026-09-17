import { describe, expect, it } from 'vitest'
import { unavailableLink } from '@/lib/api/claims'
import { CLAIM_POLICIES } from '@/lib/api/claim-policy'

/*
 * SPEC.md §6.4 — the unavailable answer is ONE shape whatever the reason, and
 * #79's policy field follows #14's `otpRequired` precedent: a fixed, non-null
 * value that says nothing about the real campaign. The route-level check across
 * unknown / expired / claimed / cancelled under each policy is
 * scripts/verify-claim-policies.ts; this pins the serialisation itself.
 */
describe('unavailableLink', () => {
  it('serialises identically every time, with policy open and no passkey', () => {
    const a = JSON.stringify(unavailableLink())
    const b = JSON.stringify(unavailableLink())
    expect(a).toBe(b)
    expect(unavailableLink()).toMatchObject({ status: 'unavailable', otpRequired: false, policy: 'open', passkeyBound: false })
  })

  it('has no null-vs-value field that could vary between reasons', () => {
    const shape = unavailableLink()
    expect(typeof shape.otpRequired).toBe('boolean')
    expect(typeof shape.passkeyBound).toBe('boolean')
    expect(CLAIM_POLICIES).toContain(shape.policy)
  })
})
