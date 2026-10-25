import { beforeEach, describe, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ find: vi.fn(), count: vi.fn(), update: vi.fn() }))
vi.mock('@/lib/db/client', () => ({ prisma: { campaign: { findFirst: fixture.find, update: fixture.update }, delivery: { count: fixture.count } } }))
vi.mock('@/lib/api/session-guard', () => ({ requireUser: async () => ({ user: { id: 'user' }, org: { id: 'org' } }), owned: (id: string, organizationId: string) => ({ id, organizationId }) }))
vi.mock('@/lib/api/audit', () => ({ recordAudit: vi.fn() }))
vi.mock('@/lib/auth/client-ip', () => ({ clientIp: () => '127.0.0.1' }))
import { PATCH } from '@/app/api/campaigns/[id]/route'
const patch = (days: number[]) => PATCH(new Request('https://kleym.test/api/campaigns/campaign', { method: 'PATCH', body: JSON.stringify({ reminderDaysBefore: days }) }), { params: Promise.resolve({ id: 'campaign' }) })
beforeEach(() => {
  vi.clearAllMocks()
  fixture.find.mockResolvedValue({ id: 'campaign', status: 'ACTIVE', claimPolicy: 'EMAIL' })
  fixture.count.mockResolvedValue(0)
  fixture.update.mockResolvedValue({ id: 'campaign', name: 'QA', status: 'ACTIVE', reminderDaysBefore: [1] })
})
describe('OTP-only campaign reminder boundary', () => {
  it('refuses an unusable reminder schedule without writing it', async () => {
    expect((await patch([1])).status).toBe(400)
    expect(fixture.update).not.toHaveBeenCalled()
  })
  it('preserves schedules for historical emailed invitations', async () => {
    fixture.count.mockResolvedValue(1)
    expect((await patch([1])).status).toBe(200)
    expect(fixture.update).toHaveBeenCalled()
  })
  it('allows clearing an old schedule on an OTP-only campaign', async () => {
    expect((await patch([])).status).toBe(200)
    expect(fixture.count).not.toHaveBeenCalled()
  })
  it('does not change non-email campaign behavior', async () => {
    fixture.find.mockResolvedValue({ id: 'campaign', status: 'DRAFT', claimPolicy: 'OPEN' })
    expect((await patch([1])).status).toBe(200)
    expect(fixture.count).not.toHaveBeenCalled()
  })
})
