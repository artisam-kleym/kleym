import { describe, expect, it, vi } from 'vitest'

const { call } = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('@/lib/stellar/horizon', () => ({
  horizon: () => ({ operations: () => ({ forClaimableBalance: () => ({ limit: () => ({ call }) }) }) }),
  loadClaimableBalance: vi.fn(),
}))

import { readDisposal } from '@/lib/api/reconcile'

describe('readDisposal', () => {
  it('carries the disposal ledger time from Horizon', async () => {
    call.mockResolvedValueOnce({ records: [{ type: 'claim_claimable_balance', claimant: 'sender', transaction_hash: 'hash', created_at: '2026-09-14T10:15:00Z' }] })
    expect(await readDisposal('balance')).toEqual({ claimant: 'sender', transactionHash: 'hash', claimedAt: new Date('2026-09-14T10:15:00Z') })
  })

  it('leaves missing or invalid disposal times unresolved', async () => {
    for (const created_at of [undefined, 'unreadable']) {
      call.mockResolvedValueOnce({ records: [{ type: 'claim_claimable_balance', claimant: 'sender', transaction_hash: 'hash', created_at }] })
      expect(await readDisposal('balance')).toBeNull()
    }
    call.mockResolvedValueOnce({ records: [] })
    expect(await readDisposal('balance')).toBeNull()
  })
})
