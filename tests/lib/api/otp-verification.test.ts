import { beforeEach, describe, expect, it, vi } from 'vitest'
import argon2 from 'argon2'
const db = vi.hoisted(() => ({ claimLink: { findUnique: vi.fn() }, delivery: { findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() } }))
const cache = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn() }))
vi.mock('@/lib/db/client', () => ({ prisma: db }))
vi.mock('@/lib/redis/client', () => ({ redis: cache }))
vi.mock('@/lib/config/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))
import { verifyOtp, issueOtp, otpSatisfied } from '@/lib/api/otp'
let challenge: { otpHash: string | null; otpExpires: Date | null; otpAttempts: number }
let link: { id: string; status: string; suspendedAt: Date | null; delivery: { id: string; email: string | null }; campaign: { expiresAt: Date; suspendedAt: Date | null } }
const tokens = new Map<string, string>()
beforeEach(async () => {
  vi.clearAllMocks(); tokens.clear()
  challenge = { otpHash: await argon2.hash('123456'), otpExpires: new Date(Date.now() + 600000), otpAttempts: 0 }
  link = { id: 'link-a', status: 'ACTIVE', suspendedAt: null, delivery: { id: 'binding-a', email: 'recipient@example.com' }, campaign: { expiresAt: new Date(Date.now() + 3600000), suspendedAt: null } }
  db.claimLink.findUnique.mockImplementation(async () => link)
  db.delivery.findUniqueOrThrow.mockImplementation(async () => ({ ...challenge }))
  db.delivery.update.mockImplementation(async ({ data }) => { Object.assign(challenge, data); return { ...challenge } })
  db.delivery.updateMany.mockImplementation(async ({ where, data }) => {
    if (where.otpHash !== challenge.otpHash || (where.otpExpires && (!challenge.otpExpires || challenge.otpExpires <= where.otpExpires.gt)) ||
      (where.otpAttempts?.lt !== undefined && challenge.otpAttempts >= where.otpAttempts.lt) || (where.otpAttempts?.gte !== undefined && challenge.otpAttempts < where.otpAttempts.gte)) return { count: 0 }
    Object.assign(challenge, { ...data, ...(data.otpAttempts?.increment ? { otpAttempts: challenge.otpAttempts + data.otpAttempts.increment } : {}) })
    return { count: 1 }
  })
  cache.set.mockImplementation(async (key, value) => { tokens.set(key, value); return 'OK' })
  cache.get.mockImplementation(async (key) => tokens.get(key) ?? null)
})
describe('single-use email OTP', () => {
  it('verifies once, stores only a hashed scoped token, and refuses replay', async () => {
    const result = await verifyOtp('public-key', '123456')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(challenge.otpHash).toBeNull()
    expect([...tokens.keys()][0]).not.toContain(result.token)
    expect(await otpSatisfied('public-key', result.token)).toBe(true)
    link.id = 'another-link'
    expect(await otpSatisfied('public-key', result.token)).toBe(false)
    expect((await verifyOtp('public-key', '123456')).ok).toBe(false)
  })
  it('grants exactly one token under simultaneous correct verification', async () => {
    const outcomes = await Promise.all([verifyOtp('key', '123456'), verifyOtp('key', '123456')])
    expect(outcomes.filter((result) => result.ok)).toHaveLength(1)
    expect(cache.set).toHaveBeenCalledTimes(1)
  })
  it('bounds concurrent wrong guesses at five and destroys the spent challenge', async () => {
    await Promise.all(Array.from({ length: 8 }, () => verifyOtp('key', '999999')))
    expect(challenge.otpAttempts).toBe(5)
    expect(challenge.otpHash).toBeNull()
    expect(await verifyOtp('key', '123456')).toMatchObject({ ok: false, reason: 'locked' })
    expect(cache.set).not.toHaveBeenCalled()
  })
  it('rejects expired challenges without issuing authorization', async () => {
    challenge.otpExpires = new Date(Date.now() - 1)
    expect(await verifyOtp('key', '123456')).toMatchObject({ ok: false, reason: 'expired' })
    expect(cache.set).not.toHaveBeenCalled()
  })
  it('issues replacement codes as hashes with a fresh ten-minute expiry', async () => {
    const now = new Date()
    const code = await issueOtp('binding-a', now)
    expect(code).toMatch(/^\d{6}$/)
    expect(challenge.otpHash).not.toBe(code)
    expect(await argon2.verify(challenge.otpHash!, code)).toBe(true)
    expect(challenge.otpExpires!.getTime() - now.getTime()).toBe(600000)
    expect(challenge.otpAttempts).toBe(0)
  })
  it('refuses redacted, suspended, settled and expired links', async () => {
    link.delivery.email = null
    expect((await verifyOtp('key', '123456')).ok).toBe(false)
    link.delivery.email = 'recipient@example.com'; link.suspendedAt = new Date()
    expect((await verifyOtp('key', '123456')).ok).toBe(false)
    link.suspendedAt = null; link.status = 'CLAIMED'
    expect((await verifyOtp('key', '123456')).ok).toBe(false)
    link.status = 'ACTIVE'; link.campaign.expiresAt = new Date(Date.now() - 1)
    expect((await verifyOtp('key', '123456')).ok).toBe(false)
    expect(cache.set).not.toHaveBeenCalled()
  })
  it('fails closed when the token store is unavailable', async () => {
    cache.get.mockRejectedValue(new Error('cache unavailable'))
    expect(await otpSatisfied('key', 'untrusted-token')).toBe(false)
  })
})
