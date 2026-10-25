import { beforeEach, describe, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ rate: vi.fn(), verify: vi.fn() }))
vi.mock('@/lib/auth/rate-limit', () => ({ rateLimit: fixture.rate }))
vi.mock('@/lib/auth/client-ip', () => ({ clientIp: () => 'shared-network' }))
vi.mock('@/lib/api/otp', () => ({ verifyOtp: fixture.verify }))
vi.mock('@/lib/config/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))
import { POST } from '@/app/api/claims/otp/verify/route'
beforeEach(() => {
  vi.clearAllMocks()
  const counts = new Map<string, number>()
  fixture.rate.mockImplementation(async (bucket: string, limit: number) => {
    const count = (counts.get(bucket) ?? 0) + 1; counts.set(bucket, count)
    return { allowed: count <= limit, retryAfterSeconds: 900 }
  })
  fixture.verify.mockResolvedValue({ ok: false, reason: 'wrong', attemptsLeft: 2 })
})
describe('shared-network OTP verification', () => {
  it('does not let one link borrow the larger shared-network allowance', async () => {
    const responses: number[] = []
    for (let attempt = 0; attempt < 11; attempt++) {
      const response = await POST(new Request('https://kleym.test/api/claims/otp/verify', { method: 'POST',
        body: JSON.stringify({ ephemeralPublicKey: 'G' + 'A'.repeat(55), code: '999999' }) }))
      responses.push(response.status)
    }
    expect(responses.slice(0, 10)).toEqual(Array(10).fill(409))
    expect(responses[10]).toBe(429)
    expect(fixture.verify).toHaveBeenCalledTimes(10)
  })
  it('gives different recipients behind one IP their own verification attempts', async () => {
    for (const suffix of ['B', 'C', 'D', 'E']) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await POST(new Request('https://kleym.test/api/claims/otp/verify', { method: 'POST',
          body: JSON.stringify({ ephemeralPublicKey: 'G' + 'A'.repeat(54) + suffix, code: '999999' }) }))
        expect(response.status).toBe(409)
      }
    }
    expect(fixture.verify).toHaveBeenCalledTimes(12)
  })
})
