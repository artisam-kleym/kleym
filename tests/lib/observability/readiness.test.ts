import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const fixture=vi.hoisted(()=>({postgres:vi.fn(),redis:vi.fn(),horizon:vi.fn()}))
vi.mock('@/lib/db/client',()=>({prisma:{$queryRaw:fixture.postgres}}))
vi.mock('@/lib/redis/client',()=>({redis:{ping:fixture.redis}}))
vi.mock('@/lib/stellar/horizon',()=>({assertHorizonNetwork:fixture.horizon}))
vi.mock('@/lib/api/sponsor-status',()=>({sponsorStatuses:vi.fn()}))
import { probeDependencies } from '@/lib/observability/status'
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();fixture.postgres.mockResolvedValue([]);fixture.redis.mockResolvedValue('PONG');fixture.horizon.mockResolvedValue(undefined)})
afterEach(()=>vi.useRealTimers())
describe('bounded readiness dependencies',()=>{
  it('does not cut off Horizon before its own five-second request deadline',async()=>{
    fixture.horizon.mockImplementation(()=>new Promise(resolve=>setTimeout(resolve,3500)))
    const checks=probeDependencies()
    await vi.advanceTimersByTimeAsync(3500)
    expect((await checks).find(check=>check.name==='horizon')?.ok).toBe(true)
  })
  it('still refuses a mismatched network identity',async()=>{
    fixture.horizon.mockRejectedValue(new Error('network identity mismatch'))
    expect((await probeDependencies()).find(check=>check.name==='horizon')?.ok).toBe(false)
  })
  it('clears timers immediately when all dependencies respond',async()=>{
    expect((await probeDependencies()).every(check=>check.ok)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('bounds a stuck dependency and clears completed probe timers',async()=>{
    fixture.postgres.mockImplementation(()=>new Promise(()=>undefined))
    const checks=probeDependencies()
    await vi.advanceTimersByTimeAsync(3000)
    expect((await checks).find(check=>check.name==='postgres')?.ok).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
