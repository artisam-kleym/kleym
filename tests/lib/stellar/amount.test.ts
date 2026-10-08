import { describe, expect, it } from 'vitest'
import { isStellarAmount, MAX_STELLAR_AMOUNT } from '@/lib/stellar/amount'
import { parseLabels } from '@/lib/campaign/csv'
import { computeCost } from '@/lib/campaign/cost'

describe('prize amount boundaries shared by browser and server', () => {
  it.each(['0.0000001', '0001.0000000', MAX_STELLAR_AMOUNT, `000${MAX_STELLAR_AMOUNT}`])('accepts the exact valid amount %s', (value) => {
    expect(isStellarAmount(value)).toBe(true)
  })
  it.each(['0.0000000', '922337203685.4775808', '922337203686', '1e3', '-1', '1.00000001', '9'.repeat(5000)])('refuses invalid or overflowing input', (value) => {
    expect(isStellarAmount(value)).toBe(false)
  })
  it('refuses an oversized variable prize when importing the recipient CSV', () => {
    expect(parseLabels('label,amount\nWinner,922337203685.4775808', 10000)).toMatchObject({ ok: false, reason: 'amount', line: 2 })
    expect(parseLabels(`label,amount\nWinner,${MAX_STELLAR_AMOUNT}`, 10000)).toMatchObject({ ok: true, amounts: [MAX_STELLAR_AMOUNT] })
  })
  it('keeps the last stroop in a 10,000-prize total in both uniform and variable campaigns', () => {
    const input = { amountPerLink: MAX_STELLAR_AMOUNT, linkCount: 10000, reservePerLink: '1', maxOpsPerBatch: 90, baseFeeStroops: '1000', sponsored: true }
    expect(computeCost(input).totalAmount).toBe('9223372036854775.807')
    expect(computeCost({ ...input, amounts: Array<string>(10000).fill(MAX_STELLAR_AMOUNT) }).totalAmount).toBe('9223372036854775.807')
  })
  it('refuses invalid amounts before generating the review budget', () => {
    const input = { amountPerLink: '1', linkCount: 1, reservePerLink: '1', maxOpsPerBatch: 90, baseFeeStroops: '1000' }
    expect(() => computeCost({ ...input, amountPerLink: '0' })).toThrow('positive amount')
    expect(() => computeCost({ ...input, amounts: ['922337203685.4775808'] })).toThrow('positive amount')
  })
})
