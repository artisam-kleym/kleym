import { beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => vi.resetModules())

it('keeps app handoff blocked until every active review is released', async () => {
  const m = await import('@/lib/wallet/handoff')
  const listener = vi.fn()
  const unsubscribe = m.subscribeWalletHandoff(listener)
  expect(m.walletHandoffBlocked()).toBe(false)
  const first = m.holdWalletHandoff(), second = m.holdWalletHandoff()
  first()
  expect(m.walletHandoffBlocked()).toBe(true)
  first() // Repeated cleanup must not release a different review.
  expect(m.walletHandoffBlocked()).toBe(true)
  second()
  expect(m.walletHandoffBlocked()).toBe(false)
  expect(listener).toHaveBeenCalledTimes(4)
  expect(listener.mock.calls.every((call) => call.length === 0)).toBe(true)
  unsubscribe()
  m.holdWalletHandoff()()
  expect(listener).toHaveBeenCalledTimes(4)
})
