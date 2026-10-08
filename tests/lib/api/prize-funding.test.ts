import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Account, Keypair } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { env } from '@/lib/config/env'
import { prepareBatch } from '@/lib/api/batches'

const fixture = vi.hoisted(() => ({
  campaign: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  batch: { count: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  claimLink: { findMany: vi.fn() },
  $transaction: vi.fn(),
  loadAccount: vi.fn(), spendable: vi.fn(), coordinate: vi.fn(), reserve: vi.fn(),
}))
vi.mock('@/lib/db/client', () => ({ prisma: fixture }))
vi.mock('@/lib/stellar/context', () => ({ stellarContextProblem: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/api/approvals', () => ({ approvalGate: vi.fn().mockResolvedValue(null), recordSigner: vi.fn() }))
vi.mock('@/lib/api/screening', () => ({ screeningGate: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/stellar/horizon', async (original) => ({
  ...await original<typeof import('@/lib/stellar/horizon')>(),
  horizon: () => ({ loadAccount: fixture.loadAccount }),
  baseReserve: fixture.reserve,
  spendableNative: fixture.spendable,
}))
vi.mock('@/lib/stellar/source-coordination', async (original) => ({
  ...await original<typeof import('@/lib/stellar/source-coordination')>(), coordinateSource: fixture.coordinate,
}))

const sender = Keypair.random().publicKey()
const issuer = Keypair.random().publicKey()
const link = (amount: string) => ({ id: Keypair.random().publicKey(), ephemeralPublicKey: Keypair.random().publicKey(), amount: new Decimal(amount) })
let campaign: Record<string, unknown>
let batches: { id: string; sequence: number; status: string; preparedXdr: null; links: ReturnType<typeof link>[] }[]

function senderBalance(balance: string, selling = '0', authorized = true, assetIssuer = issuer) {
  const account = Object.assign(new Account(sender, '100'), { balances: [{ asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: assetIssuer, balance, selling_liabilities: selling, is_authorized: authorized }] })
  fixture.loadAccount.mockImplementation(async (address: string) => address === sender ? account : new Account(address, '100'))
}

beforeEach(() => {
  vi.clearAllMocks()
  campaign = { id: 'prizes', name: 'Prizes', status: 'DRAFT', network: 'testnet', senderPublicKey: sender, assetCode: 'USDC', assetIssuer: issuer,
    amountPerLink: new Decimal(1), linkCount: 3, expiresAt: new Date(Date.now() + 3600000), csvExportedAt: new Date(), sponsorPublicKey: env.SPONSOR_PUBLIC_KEY, fundingMode: 'SPONSORED' }
  batches = [{ id: 'first', sequence: 1, status: 'PENDING', preparedXdr: null, links: [link('1'), link('1')] },
    { id: 'second', sequence: 2, status: 'PENDING', preparedXdr: null, links: [link('1')] }]
  fixture.campaign.findFirst.mockImplementation(async () => campaign)
  fixture.campaign.findUniqueOrThrow.mockImplementation(async () => campaign)
  fixture.batch.count.mockResolvedValue(2)
  fixture.batch.findMany.mockImplementation(async () => batches)
  fixture.batch.updateMany.mockResolvedValue({ count: 1 })
  fixture.$transaction.mockImplementation(async (action: (db: typeof fixture) => Promise<unknown>) => action(fixture))
  fixture.coordinate.mockImplementation(async (_body, _owner, persist: (db: typeof fixture, check: ReturnType<typeof vi.fn>) => Promise<unknown>) => persist(fixture, vi.fn()))
  fixture.spendable.mockReturnValue(new Decimal('100'))
  fixture.reserve.mockResolvedValue(new Decimal('0.5'))
  senderBalance('100')
})

describe('remaining prize funding admission', () => {
  it('refuses an incomplete list without persisting batches or an envelope', async () => {
    fixture.batch.count.mockResolvedValue(0)
    fixture.claimLink.findMany.mockResolvedValue(batches[0]!.links)
    expect(await prepareBatch('prizes', 'org', {})).toMatchObject({ kind: 'conflict', detail: expect.stringContaining('recipient list is incomplete') })
    expect(fixture.batch.create).not.toHaveBeenCalled()
    expect(fixture.coordinate).not.toHaveBeenCalled()
  })
  it('refuses a historical plan that omitted a declared prize', async () => {
    batches.pop()
    expect(await prepareBatch('prizes', 'org', {})).toMatchObject({ kind: 'conflict', detail: expect.stringContaining('every prize link') })
    expect(fixture.loadAccount).not.toHaveBeenCalled()
  })
  it('refuses when the first batch fits but the remaining USDC does not', async () => {
    senderBalance('2')
    expect(await prepareBatch('prizes', 'org', {})).toMatchObject({ kind: 'conflict', detail: expect.stringContaining('all remaining prize links') })
    expect(fixture.coordinate).not.toHaveBeenCalled()
  })
  it('refuses when the first batch fits but remaining reserves plus both batch fees do not', async () => {
    fixture.spendable.mockReturnValue(new Decimal('3.0006')) // 3 links + 4/3 operation fees = 3.0007.
    expect(await prepareBatch('prizes', 'org', {})).toMatchObject({ kind: 'conflict', detail: expect.stringContaining('funding fees') })
    expect(fixture.coordinate).not.toHaveBeenCalled()
  })
  it('uses each variable prize, not the campaign default', async () => {
    batches[1]!.links = [link('5.0000001')]
    senderBalance('7')
    expect((await prepareBatch('prizes', 'org', {})).kind).toBe('conflict')
    expect(fixture.coordinate).not.toHaveBeenCalled()
  })
  it('subtracts selling liabilities and refuses deauthorized funds', async () => {
    senderBalance('3', '0.0000001')
    expect((await prepareBatch('prizes', 'org', {})).kind).toBe('conflict')
    senderBalance('100', '0', false)
    expect(await prepareBatch('prizes', 'org', {})).toMatchObject({ kind: 'conflict', detail: expect.stringContaining('not authorized') })
    expect(fixture.coordinate).not.toHaveBeenCalled()
  })
  it('cannot count another asset with the same USDC code', async () => {
    senderBalance('100', '0', true, Keypair.random().publicKey())
    expect((await prepareBatch('prizes', 'org', {})).kind).toBe('conflict')
    expect(fixture.coordinate).not.toHaveBeenCalled()
  })
  it('admits exactly sufficient capital for all remaining prizes', async () => {
    senderBalance('3')
    fixture.spendable.mockReturnValue(new Decimal('3.0007'))
    expect(await prepareBatch('prizes', 'org', {})).toMatchObject({ kind: 'ok', value: { sequence: 1, totalBatches: 2, linkCount: 2 } })
    expect(fixture.batch.updateMany).toHaveBeenCalledOnce()
    expect(fixture.loadAccount.mock.calls.map(([address]) => address)).toEqual([sender, env.SPONSOR_PUBLIC_KEY])
    expect(fixture.reserve).toHaveBeenCalledOnce()
    expect(fixture.spendable).toHaveBeenCalledWith(expect.any(Account), new Decimal('0.5'))
  })
  it('preserves confirmed prizes and only budgets the failed remaining batch', async () => {
    campaign.status = 'PARTIAL'
    batches[0]!.status = 'CONFIRMED'
    batches[1]!.status = 'FAILED'
    senderBalance('1')
    fixture.spendable.mockReturnValue(new Decimal('1.0003'))
    expect(await prepareBatch('prizes', 'org', {})).toMatchObject({ kind: 'ok', value: { sequence: 2, linkCount: 1 } })
    expect(fixture.batch.updateMany.mock.calls[0]![0].where.id).toBe('second')
  })
  it('waits for submitted funding confirmation instead of charging its prizes again', async () => {
    batches[0]!.status = 'SUBMITTED'
    expect(await prepareBatch('prizes', 'org', {})).toMatchObject({ kind: 'conflict', detail: expect.stringContaining('awaiting ledger confirmation') })
    expect(fixture.loadAccount).not.toHaveBeenCalled()
    expect(fixture.coordinate).not.toHaveBeenCalled()
  })
})
