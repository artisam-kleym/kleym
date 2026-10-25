import { beforeEach, describe, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ gate: vi.fn(), issue: vi.fn(), mail: vi.fn(), rate: vi.fn(), lock: vi.fn(), unlock: vi.fn(), error: vi.fn(), monitor: vi.fn() }))
vi.mock('@/lib/config/env', () => ({ env: { EMAIL_PROVIDER: 'zender' } }))
vi.mock('@/lib/queue/email-status', () => ({ enqueueEmailStatus: fixture.monitor }))
vi.mock('@/lib/api/otp', () => ({ gateFor: fixture.gate, issueOtp: fixture.issue }))
vi.mock('@/lib/email/provider', () => ({ resend: fixture.mail }))
vi.mock('@/lib/auth/rate-limit', () => ({ rateLimit: fixture.rate }))
vi.mock('@/lib/auth/client-ip', () => ({ clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/redis/client', () => ({ redis: { set: fixture.lock, eval: fixture.unlock } }))
vi.mock('@/lib/config/logger', () => ({ logger: { info: vi.fn(), error: fixture.error } }))
import { POST } from '@/app/api/claims/otp/request/route'
const key = 'G' + 'A'.repeat(55)
const request = (publicKey = key) => new Request('https://kleym.test/api/claims/otp/request', { method: 'POST', body: JSON.stringify({ ephemeralPublicKey: publicKey }) })
beforeEach(() => {
  vi.clearAllMocks()
  fixture.gate.mockResolvedValue({ linkId: 'link-1', deliveryId: 'binding-1', email: 'recipient@example.com', claimable: true })
  fixture.issue.mockResolvedValue('123456'); fixture.mail.mockResolvedValue({ id: 'message-1' })
  fixture.rate.mockResolvedValue({ allowed: true }); fixture.lock.mockResolvedValue('OK'); fixture.unlock.mockResolvedValue(1)
  fixture.monitor.mockResolvedValue(undefined)
})
describe('OTP mail request boundary', () => {
  it('allows four different recipients behind one shared network without combining their mail budgets', async () => {
    const counts = new Map<string, number>()
    fixture.rate.mockImplementation(async (bucket: string, limit: number) => {
      const count = (counts.get(bucket) ?? 0) + 1; counts.set(bucket, count)
      return { allowed: count <= limit, retryAfterSeconds: 900 }
    })
    fixture.gate.mockImplementation(async (publicKey: string) => ({ linkId: publicKey, deliveryId: publicKey, email: `${publicKey.slice(-1).toLowerCase()}@example.com`, claimable: true }))
    for (const suffix of ['B', 'C', 'D', 'E']) expect((await POST(request('G' + 'A'.repeat(54) + suffix))).status).toBe(200)
    expect(fixture.mail).toHaveBeenCalledTimes(4)
  })
  it('still limits one mailbox across separate links on the same network', async () => {
    const counts = new Map<string, number>()
    fixture.rate.mockImplementation(async (bucket: string, limit: number) => {
      const count = (counts.get(bucket) ?? 0) + 1; counts.set(bucket, count)
      return { allowed: count <= limit, retryAfterSeconds: 900 }
    })
    for (const suffix of ['B', 'C', 'D', 'E']) await POST(request('G' + 'A'.repeat(54) + suffix))
    expect(fixture.mail).toHaveBeenCalledTimes(3)
  })
  it('sends the assigned mailbox only, with no private URL and an event identity unrelated to the code', async () => {
    const response = await POST(request())
    expect(await response.json()).toEqual({ sent: true })
    const message = fixture.mail.mock.calls[0]![0]
    expect(message.to).toBe('recipient@example.com')
    expect(message.idempotencyKey).toMatch(/^otp:binding-1:/)
    expect(message.idempotencyKey).not.toContain('123456')
    expect(JSON.stringify(message)).not.toContain('/claim#')
    expect(fixture.rate.mock.calls[2]![0]).not.toContain('recipient@example.com')
    expect(fixture.unlock).toHaveBeenCalledTimes(1)
    expect(fixture.monitor).toHaveBeenCalledWith({ deliveryId: 'binding-1', providerId: 'message-1' })
  })
  it('gives the same response for missing/redacted/inactive links and provider failures', async () => {
    for (const gate of [null, { email: null }, { email: 'recipient@example.com', claimable: false }]) {
      fixture.gate.mockResolvedValue(gate)
      expect(await (await POST(request())).json()).toEqual({ sent: true })
    }
    expect(fixture.issue).not.toHaveBeenCalled(); expect(fixture.mail).not.toHaveBeenCalled()
    fixture.gate.mockResolvedValue({ linkId: 'link-1', deliveryId: 'binding-1', email: 'recipient@example.com', claimable: true })
    fixture.mail.mockRejectedValue(new Error('Zender rejected mail (503)'))
    expect(await (await POST(request())).json()).toEqual({ sent: true })
    expect(fixture.unlock).toHaveBeenCalled()
  })
  it('does not replace a challenge when another send is in progress or mailbox rate is exhausted', async () => {
    fixture.lock.mockResolvedValue(null)
    expect(await (await POST(request())).json()).toEqual({ sent: true })
    expect(fixture.issue).not.toHaveBeenCalled()
    fixture.rate.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false })
    expect(await (await POST(request())).json()).toEqual({ sent: true })
    expect(fixture.issue).not.toHaveBeenCalled()
  })
  it('rejects injected recipient fields and malformed bodies before looking up a binding', async () => {
    const response = await POST(new Request('https://kleym.test/api/claims/otp/request', { method: 'POST', body: JSON.stringify({ ephemeralPublicKey: key, email: 'attacker@example.com' }) }))
    expect(response.status).toBe(400)
    expect(fixture.gate).not.toHaveBeenCalled()
  })
  it('does not resend or pretend the send failed when only monitoring could not enqueue', async () => {
    fixture.monitor.mockRejectedValue(new Error('queue unavailable'))
    expect(await (await POST(request())).json()).toEqual({ sent: true })
    expect(fixture.mail).toHaveBeenCalledTimes(1)
    expect(fixture.error).toHaveBeenCalledWith({ deliveryId: 'binding-1', providerId: 'message-1' }, expect.stringContaining('monitor unavailable'))
  })
})
