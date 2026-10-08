import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Account, Asset, Keypair, Operation, TransactionBuilder, type Horizon } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { env } from '@/lib/config/env'
import { coordinateSource } from '@/lib/stellar/source-coordination'
import { spendableNative } from '@/lib/stellar/horizon'
import { prepareBatch } from '@/lib/api/batches'

const fixture = vi.hoisted(() => ({
  loadAccount: vi.fn(), reserve: vi.fn(), $transaction: vi.fn(), $executeRaw: vi.fn(),
  batch: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() }, ledgerAttempt: { findMany: vi.fn() },
  campaign: { findFirst: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/db/client', () => ({ prisma: fixture }))
vi.mock('@/lib/stellar/context', () => ({ stellarContextProblem: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/api/approvals', () => ({ approvalGate: vi.fn().mockResolvedValue(null), recordSigner: vi.fn() }))
vi.mock('@/lib/api/screening', () => ({ screeningGate: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/stellar/horizon', async (original) => ({
  ...await original<typeof import('@/lib/stellar/horizon')>(),
  horizon: () => ({ loadAccount: fixture.loadAccount }), baseReserve: fixture.reserve,
}))

const source = Keypair.random().publicKey(), recipient = Keypair.random().publicKey()
function record(balance = '5', selling = '0', sponsoring = 0, sponsored = 0) {
  return Object.assign(new Account(source, '100'), {
    balances: [{ asset_type: 'native', balance, selling_liabilities: selling }],
    subentry_count: 0, num_sponsoring: sponsoring, num_sponsored: sponsored,
  }) as unknown as Horizon.AccountResponse
}
function payment(amount = '1') {
  return new TransactionBuilder(new Account(source, '100'), { fee: '1000', networkPassphrase: env.NETWORK_PASSPHRASE })
    .addOperation(Operation.payment({ destination: recipient, asset: Asset.native(), amount })).setTimeout(180).build()
}
beforeEach(() => {
  vi.clearAllMocks()
  fixture.$transaction.mockImplementation(async (action: (db: typeof fixture) => Promise<unknown>) => action(fixture))
  fixture.batch.findMany.mockResolvedValue([])
  fixture.ledgerAttempt.findMany.mockResolvedValue([])
  fixture.reserve.mockResolvedValue(new Decimal('0.5'))
  fixture.loadAccount.mockResolvedValue(record())
})

describe('fresh source admission with one observation per provider value', () => {
  it('prepares sponsored funding with five provider reads across preparation and locked admission (previously ten)', async () => {
    const sender = Keypair.random().publicKey(), issuer = Keypair.random().publicKey()
    const campaign = { id: 'campaign', name: 'Prizes', status: 'DRAFT', network: env.STELLAR_NETWORK, senderPublicKey: sender,
      assetCode: 'USDC', assetIssuer: issuer, amountPerLink: new Decimal(1), linkCount: 1, csvExportedAt: new Date(),
      sponsorPublicKey: env.SPONSOR_PUBLIC_KEY, fundingMode: 'SPONSORED', expiresAt: new Date(Date.now() + 3600000) }
    const senderRecord = Object.assign(new Account(sender, '100'), { balances: [{ asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: issuer,
      balance: '1.0000000', selling_liabilities: '0.0000000', is_authorized: true }] })
    const sponsorRecord = Object.assign(record('10'), new Account(env.SPONSOR_PUBLIC_KEY, '100')) as unknown as Horizon.AccountResponse
    fixture.loadAccount.mockImplementation(async (address: string) => address === sender ? senderRecord : sponsorRecord)
    fixture.campaign.findFirst.mockResolvedValue(campaign)
    fixture.batch.count.mockResolvedValue(1)
    fixture.batch.findMany.mockResolvedValue([{ id: 'batch', sequence: 1, status: 'PENDING', preparedXdr: null,
      links: [{ id: 'link', ephemeralPublicKey: Keypair.random().publicKey(), amount: new Decimal(1) }] }])
    fixture.batch.updateMany.mockResolvedValue({ count: 1 })
    expect(await prepareBatch('campaign', 'org', {})).toMatchObject({ kind: 'ok', value: { feePayer: env.SPONSOR_PUBLIC_KEY, linkCount: 1 } })
    expect(fixture.loadAccount.mock.calls.map(([address]) => address)).toEqual([sender, env.SPONSOR_PUBLIC_KEY, env.SPONSOR_PUBLIC_KEY])
    expect(fixture.reserve).toHaveBeenCalledTimes(2)
    expect(senderRecord.sequenceNumber()).toBe('100')
    expect(sponsorRecord.sequenceNumber()).toBe('100')
  })
  it('checks account and reserve once under the lock, then persists', async () => {
    const tx = payment(), saved = vi.fn()
    await coordinateSource(tx, { scope: 'claim:test' }, async (_db, check) => { await check(tx); saved() })
    expect(fixture.$executeRaw).toHaveBeenCalledOnce()
    expect(fixture.loadAccount).toHaveBeenCalledExactlyOnceWith(source)
    expect(fixture.reserve).toHaveBeenCalledOnce()
    expect(fixture.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(fixture.loadAccount.mock.invocationCallOrder[0]!)
    expect(saved).toHaveBeenCalledOnce()
  })
  it('refuses a sequence changed after preparation without persisting', async () => {
    fixture.loadAccount.mockResolvedValue(Object.assign(record(), new Account(source, '101')))
    const tx = payment(), saved = vi.fn()
    await expect(coordinateSource(tx, { scope: 'claim:test' }, async (_db, check) => { await check(tx); saved() })).rejects.toThrow('sequence changed')
    expect(saved).not.toHaveBeenCalled()
  })
  it('reads again on the next admission and refuses newly committed reserves/liabilities', async () => {
    const tx = payment(), persist = async (_db: unknown, check: (body: typeof tx) => Promise<void>) => check(tx)
    await coordinateSource(tx, { scope: 'claim:test' }, persist)
    fixture.loadAccount.mockResolvedValue(record('5', '2', 3)) // spendable 0.5, payment needs 1.0001.
    await expect(coordinateSource(tx, { scope: 'claim:test' }, persist)).rejects.toThrow('cannot cover')
    expect(fixture.loadAccount).toHaveBeenCalledTimes(2)
    expect(fixture.reserve).toHaveBeenCalledTimes(2)
  })
  it('uses the current reserve for both the obligation and the spendable balance', async () => {
    fixture.reserve.mockResolvedValue(new Decimal('2')) // account minimum 4 leaves only 1.
    const tx = payment()
    await expect(coordinateSource(tx, { scope: 'claim:test' }, async (_db, check) => check(tx))).rejects.toThrow('cannot cover')
    expect(fixture.reserve).toHaveBeenCalledOnce()
  })
  it('propagates provider failure and never records admission', async () => {
    fixture.loadAccount.mockRejectedValue(new Error('provider unavailable'))
    const tx = payment(), saved = vi.fn()
    await expect(coordinateSource(tx, { scope: 'claim:test' }, async (_db, check) => { await check(tx); saved() })).rejects.toThrow('provider unavailable')
    expect(saved).not.toHaveBeenCalled()
  })
})

describe('exact observed spendable native balance', () => {
  it('subtracts sponsoring obligations and selling liabilities; sponsored accounts may have zero minimum', () => {
    expect(spendableNative(record('7.1234567', '0.0000001', 5, 1), new Decimal('0.5')).toFixed(7)).toBe('4.1234566')
    expect(spendableNative(record('0', '0', 0, 2), new Decimal('0.5')).toFixed(7)).toBe('0.0000000')
  })
  it('does not clamp a negative deficit into spendable capital', () => {
    expect(spendableNative(record('0.5', '0.0000001'), new Decimal('0.5')).toFixed(7)).toBe('-0.5000001')
  })
})
