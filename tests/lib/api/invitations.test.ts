/** The input boundaries of user provisioning (#39). The rest needs a database: scripts/verify-invitations.ts. */
import { describe, expect, it } from 'vitest'
import { createUserSchema, redeemSchema, inviteUrl } from '@/lib/api/invitations'

describe('creating a user', () => {
  it('accepts a plain username and defaults the roles', () => {
    expect(createUserSchema.parse({ username: 'ann.smith-2', organizationId: 'o1' })).toEqual({
      username: 'ann.smith-2', role: 'SENDER', organizationId: 'o1', orgRole: 'OPERATOR',
    })
  })
  it('needs an organisation: an account belongs somewhere', () => {
    expect(createUserSchema.safeParse({ username: 'ann' }).success).toBe(false)
  })
  it('refuses spaces, slashes, leading punctuation and unknown keys', () => {
    for (const username of ['ann smith', 'a/b', '.ann', 'ab']) {
      expect(createUserSchema.safeParse({ username, organizationId: 'o1' }).success, username).toBe(false)
    }
    // The admin never supplies a password. Not even as an ignored field.
    expect(createUserSchema.safeParse({ username: 'ann', organizationId: 'o1', password: 'x' }).success).toBe(false)
  })
})

describe('redeeming', () => {
  it('wants a 64-hex token and a 12+ character password', () => {
    expect(redeemSchema.safeParse({ token: 'a'.repeat(64), password: 'twelve-chars-ok' }).success).toBe(true)
    expect(redeemSchema.safeParse({ token: 'a'.repeat(63), password: 'twelve-chars-ok' }).success).toBe(false)
    expect(redeemSchema.safeParse({ token: 'a'.repeat(64), password: 'short' }).success).toBe(false)
  })
})

describe('the invite URL', () => {
  it('is on APP_URL under /invite/', () => {
    expect(inviteUrl('ab'.repeat(32))).toMatch(/^http:\/\/localhost:3000\/invite\/[a-f0-9]{64}$/)
  })
})
