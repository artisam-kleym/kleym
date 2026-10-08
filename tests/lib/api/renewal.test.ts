import { beforeEach, describe, expect, it, vi } from 'vitest'
import Decimal from 'decimal.js'
const mocks = vi.hoisted(() => ({ find: vi.fn(), balances: vi.fn() }))
vi.mock('@/lib/db/client', () => ({ prisma: { campaign: { findFirst: mocks.find } } }))
vi.mock('@/lib/api/reclaim', () => ({ readSenderBalances: mocks.balances }))
import { assertRenewalTerms, renewalSource } from '@/lib/api/renewal'

const now = new Date('2026-10-01T12:00:00Z')
const row = () => ({
  id: 'original', name: 'Payout', network: 'testnet', senderPublicKey: 'sender', assetCode: 'USDC', assetIssuer: 'issuer',
  amountPerLink: new Decimal(1), expiresAt: new Date('2026-10-01T11:00:00Z'), status: 'RECLAIMED', variableAmounts: false, renewal: null,
  links: [
    { balanceId: 'returned', status: 'RECLAIMED', amount: new Decimal(1), claimTxHash: 'refund', claimedBy: 'sender' },
    { balanceId: 'paid', status: 'CLAIMED', amount: new Decimal(1), claimTxHash: 'claim', claimedBy: 'recipient' },
  ],
  reclaims: [{ transactionHash: 'refund', amount: new Decimal(1), balanceCount: 1 }],
})
beforeEach(() => { mocks.find.mockResolvedValue(row()); mocks.balances.mockResolvedValue(new Map()) })
describe('renewal eligibility and budget', () => {
  it('renews exactly the refunded principal, excluding already paid recipients', async () => {
    const value = await renewalSource('original', 'org', mocks.balances, now)
    expect(value.count).toBe(1)
    expect(value.budget).toBe('1')
    expect(mocks.find.mock.calls[0][0].where).toEqual({ id: 'original', organizationId: 'org' })
    expect(() => assertRenewalTerms({ network: 'testnet', senderPublicKey: 'sender', assetCode: 'USDC', assetIssuer: 'issuer', amountPerLink: '1.0000000', linkCount: 1 }, value)).not.toThrow()
  })
  it.each([
    ['not expired', { expiresAt: new Date('2026-10-01T13:00:00Z') }],
    ['not reclaimed', { status: 'EXPIRED' }],
    ['variable amounts', { variableAmounts: true }],
    ['unsettled', { links: [{ ...row().links[0], status: 'ACTIVE' }] }],
    ['no refund', { links: [row().links[1]] }],
    ['missing receipts', { reclaims: [] }],
    ['wrong principal owner', { links: [{ ...row().links[0], claimedBy: 'other' }] }],
    ['amount drift', { reclaims: [{ transactionHash: 'refund', amount: new Decimal(2), balanceCount: 1 }] }],
    ['count drift', { reclaims: [{ transactionHash: 'refund', amount: new Decimal(1), balanceCount: 2 }] }],
  ])('refuses %s', async (_name, change) => {
    mocks.find.mockResolvedValue({ ...row(), ...change })
    await expect(renewalSource('original', 'org', mocks.balances, now)).rejects.toThrow()
  })
  it('a missing/foreign source reveals no terms', async () => {
    mocks.find.mockResolvedValue(null)
    await expect(renewalSource('foreign', 'org', mocks.balances, now)).rejects.toThrow('could not be found')
  })
  it('refuses a database refund while the original balance is still on ledger', async () => {
    mocks.balances.mockResolvedValue(new Map([['returned', '1']]))
    await expect(renewalSource('original', 'org', mocks.balances, now)).rejects.toThrow('ledger still holds')
  })
  it.each([
    { network: 'public' }, { senderPublicKey: 'other' }, { assetIssuer: 'impostor' },
    { assetCode: 'XLM' }, { amountPerLink: '2' }, { linkCount: 2 },
  ])('rejects changed renewal terms %j', async (change) => {
    const value = await renewalSource('original', 'org', mocks.balances, now)
    expect(() => assertRenewalTerms({ network: 'testnet', senderPublicKey: 'sender', assetCode: 'USDC', assetIssuer: 'issuer', amountPerLink: '1', linkCount: 1, ...change }, value)).toThrow('exactly the returned')
  })
})
