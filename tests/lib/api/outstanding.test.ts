import { describe, expect, it } from 'vitest'
import { outstandingFromLedger } from '@/lib/api/outstanding'

/*
 * #78, acceptance criterion 5: the outstanding total is what the LEDGER holds
 * for the campaign's balances, not amountPerLink × unclaimed rows.
 */
describe('outstandingFromLedger', () => {
  const links = [{ balanceId: 'a' }, { balanceId: 'b' }, { balanceId: 'c' }, { balanceId: null }]

  it('counts and sums only balances the ledger still holds', () => {
    const onLedger = new Map([['a', '2.5000000'], ['c', '2.5000000'], ['zzz', '99']])
    expect(outstandingFromLedger(links, onLedger)).toEqual({ count: 2, amount: '5' })
  })

  it("uses the ledger's amounts, which need not equal the campaign's figure", () => {
    const onLedger = new Map([['a', '0.1'], ['b', '0.2']])
    expect(outstandingFromLedger(links, onLedger)).toEqual({ count: 2, amount: '0.3' })
    expect(0.1 + 0.2).not.toBe(0.3)
  })

  it('is zero when everything has been claimed or reclaimed', () => {
    expect(outstandingFromLedger(links, new Map())).toEqual({ count: 0, amount: '0' })
  })
})
