import { expect, it, vi } from 'vitest'
import { ledgerSettlementTime } from '@/lib/stellar/settlement-time'

it('uses only explicit Horizon UTC time regardless of a skewed application clock', () => {
  vi.useFakeTimers()
  try {
    for (const clock of ['2020-01-01T00:00:00Z', '2030-01-01T00:00:00Z']) {
      vi.setSystemTime(new Date(clock))
      expect(ledgerSettlementTime('2026-10-01T12:00:00Z')?.toISOString()).toBe('2026-10-01T12:00:00.000Z')
    }
  } finally { vi.useRealTimers() }
})

it('does not guess unavailable, offset or impossible settlement timestamps', () => {
  for (const value of [null, undefined, 1790856000, '', 'not-a-time', '2026-10-01',
    '2026-02-30T12:00:00Z', '2026-10-01T20:00:00+08:00']) expect(ledgerSettlementTime(value)).toBeNull()
})
