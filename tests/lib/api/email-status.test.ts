import { beforeEach, describe, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ status: vi.fn(), info: vi.fn() }))
vi.mock('@/lib/email/zender', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/email/zender')>(), zenderMessageStatus: fixture.status }))
vi.mock('@/lib/config/logger', () => ({ logger: { info: fixture.info } }))
import { checkEmailStatus, emailStatusBackoff } from '@/workers/email-status'
import { ZenderError } from '@/lib/email/zender'
const job = { deliveryId: 'binding-1', providerId: 'message-1' }
beforeEach(() => vi.clearAllMocks())
describe('OTP delivery reconciliation', () => {
  it('never polls earlier than Retry-After even when the normal backoff is shorter', () => {
    expect(emailStatusBackoff(1, 'zender-status', new ZenderError(429, null, 120))).toBe(120000)
    expect(emailStatusBackoff(3, 'zender-status', new Error('pending'))).toBe(120000)
  })
  it.each(['queued', 'sending', 'sent'])('keeps %s unconfirmed and schedules another status check, never another email', async status => {
    fixture.status.mockResolvedValue(status)
    await expect(checkEmailStatus(job)).rejects.toThrow('unconfirmed')
    expect(fixture.info).not.toHaveBeenCalled()
  })
  it.each(['delivered', 'opened', 'clicked'])('accepts provider %s evidence', async status => {
    fixture.status.mockResolvedValue(status)
    expect(await checkEmailStatus(job)).toEqual({ status })
    expect(fixture.info).toHaveBeenCalledWith({ ...job, status }, expect.any(String))
  })
  it.each(['failed', 'suppressed', 'cancelled', 'bounced', 'complained'])('stops polling %s without resending', async status => {
    fixture.status.mockResolvedValue(status)
    await expect(checkEmailStatus(job)).rejects.toMatchObject({ name: 'UnrecoverableError' })
    expect(fixture.info).not.toHaveBeenCalled()
  })
})
