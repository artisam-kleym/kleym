import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword, verifyDummyPassword } from '@/lib/auth/password'

describe('password hashing', () => {
  it('produces an argon2id hash, not bcrypt or SHA', async () => {
    // AGENT.md §5.1 names the algorithm; assert it rather than trusting config.
    const hash = await hashPassword('a-sufficiently-long-password')
    expect(hash.startsWith('$argon2id$')).toBe(true)
  })

  it('salts, so the same password hashes differently each time', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password-here'), hashPassword('same-password-here')])
    expect(a).not.toEqual(b)
  })

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('the-right-password-1')
    expect(await verifyPassword(hash, 'the-right-password-1')).toBe(true)
    expect(await verifyPassword(hash, 'the-wrong-password-1')).toBe(false)
  })

  it('treats a malformed hash as a wrong password, never as an error', async () => {
    // A stored value that is not a hash must fail closed. Throwing here would
    // give the caller a third outcome to mishandle.
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false)
    expect(await verifyPassword('', 'anything')).toBe(false)
  })

  it('spends comparable time on the unknown-user path', async () => {
    // The point of verifyDummyPassword: without it, "no such user" returns in
    // microseconds while a real user costs an argon2 verification, which is a
    // username oracle.
    const hash = await hashPassword('a-real-users-password')

    const t0 = performance.now()
    await verifyPassword(hash, 'wrong-password-attempt')
    const real = performance.now() - t0

    const t1 = performance.now()
    await verifyDummyPassword('wrong-password-attempt')
    const dummy = performance.now() - t1

    // Same order of magnitude is the property that matters; exact parity is
    // not achievable and not required.
    expect(dummy).toBeGreaterThan(real * 0.25)
    expect(dummy).toBeLessThan(real * 4)
  })
})
