import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { registerLinks } from '@/lib/api/links'
import { hashClaimCode } from '@/lib/api/claim-policy'

const db = vi.hoisted(() => ({
  campaign: { findFirst: vi.fn(), update: vi.fn() },
  claimLink: { count: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },
  delivery: { createMany: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/db/client', () => ({ prisma: db }))
const key = Keypair.random().publicKey()
const extra = Keypair.random().publicKey()
let campaign: { id: string; status: string; linkCount: number; amountPerLink: Decimal; variableAmounts: boolean; claimPolicy: string; renewalOfId: null }
const recorded = () => ({ ephemeralPublicKey: key, recipientPublicKey: null, amount: new Decimal('1'), label: 'Winner', codeHash: null as string | null, reference: null as string | null, category: null, note: null })

beforeEach(() => {
  vi.clearAllMocks()
  campaign = { id: 'prizes', status: 'DRAFT', linkCount: 1, amountPerLink: new Decimal('1'), variableAmounts: false, claimPolicy: 'OPEN', renewalOfId: null }
  db.$transaction.mockImplementation(async (action: (tx: typeof db) => Promise<unknown>) => action(db))
  db.campaign.findFirst.mockImplementation(async () => campaign)
  db.claimLink.count.mockResolvedValue(1)
  db.claimLink.findMany.mockResolvedValue([recorded()])
  db.claimLink.createMany.mockResolvedValue({ count: 1 })
})

describe('email recipient registration', () => {
  it('requires a valid email per key and refuses emails for other policies', async () => {
    campaign.claimPolicy = 'EMAIL'
    for (const emails of [undefined, [], ['bad-address']]) {
      expect((await registerLinks('prizes', 'org', [key], undefined, undefined, undefined, undefined, undefined, emails)).kind).toBe('budget')
    }
    campaign.claimPolicy = 'OPEN'
    expect((await registerLinks('prizes', 'org', [key], undefined, undefined, undefined, undefined, undefined, ['a@example.com'])).kind).toBe('budget')
    expect(db.claimLink.createMany).not.toHaveBeenCalled()
  })
  it('atomically registers emails without a bearer URL and leaves sentAt unset', async () => {
    campaign.claimPolicy = 'EMAIL'
    db.claimLink.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1)
    db.claimLink.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'link-1', ephemeralPublicKey: key }])
    expect(await registerLinks('prizes', 'org', [key], ['Winner'], undefined, undefined, undefined, undefined, ['A@example.com'])).toEqual({ kind: 'ok', registered: 1, total: 1 })
    expect(db.delivery.createMany).toHaveBeenCalledWith({ data: [{ linkId: 'link-1', email: 'a@example.com' }] })
    expect(JSON.stringify(db.claimLink.createMany.mock.calls)).not.toContain('claim_url')
  })
  it('replays the same assignment but refuses changed or redacted addresses without restoring them', async () => {
    campaign.claimPolicy = 'EMAIL'
    db.claimLink.findMany.mockResolvedValue([{ ...recorded(), delivery: { email: 'a@example.com' } }])
    expect((await registerLinks('prizes', 'org', [key], ['Winner'], undefined, undefined, undefined, undefined, ['a@example.com'])).kind).toBe('ok')
    expect((await registerLinks('prizes', 'org', [key], ['Winner'], undefined, undefined, undefined, undefined, ['b@example.com'])).kind).toBe('budget')
    db.claimLink.findMany.mockResolvedValue([{ ...recorded(), delivery: { email: null } }])
    expect((await registerLinks('prizes', 'org', [key], ['Winner'], undefined, undefined, undefined, undefined, ['a@example.com'])).kind).toBe('budget')
    expect(db.delivery.createMany).not.toHaveBeenCalled()
  })
})

describe('public prize registration recovery', () => {
  it.each(['DRAFT', 'CREATING'])('retries an identical committed registration in %s without creating another prize', async (status) => {
    campaign.status = status
    expect(await registerLinks('prizes', 'org', [key], ['Winner'], undefined, ['1.0000000'])).toEqual({ kind: 'ok', registered: 0, total: 1 })
    expect(db.claimLink.createMany).not.toHaveBeenCalled()
  })
  it('refuses to change an already registered prize amount', async () => {
    expect(await registerLinks('prizes', 'org', [key], ['Winner'], undefined, ['2'])).toMatchObject({ kind: 'budget', detail: expect.stringContaining('different terms') })
    expect(db.claimLink.createMany).not.toHaveBeenCalled()
  })
  it('refuses to silently change labels or recipient reference data on replay', async () => {
    expect((await registerLinks('prizes', 'org', [key], ['Other'])).kind).toBe('budget')
    expect((await registerLinks('prizes', 'org', [key], ['Winner'], [{ reference: 'Other' }])).kind).toBe('budget')
    expect(db.claimLink.createMany).not.toHaveBeenCalled()
  })
  it('retries an identical code hash but refuses a replacement code', async () => {
    campaign.claimPolicy = 'CODE'
    const row = recorded()
    row.codeHash = hashClaimCode('0123456789ABC')
    db.claimLink.findMany.mockResolvedValue([row])
    expect((await registerLinks('prizes', 'org', [key], ['Winner'], undefined, undefined, ['0123456789ABC'])).kind).toBe('ok')
    expect((await registerLinks('prizes', 'org', [key], ['Winner'], undefined, undefined, ['123456789ABCD'])).kind).toBe('budget')
  })
  it('counts only new keys when resuming partial registration', async () => {
    campaign.linkCount = 2
    db.claimLink.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2)
    expect(await registerLinks('prizes', 'org', [key, extra], ['Winner', 'Second'])).toEqual({ kind: 'ok', registered: 1, total: 2 })
    expect(db.claimLink.createMany.mock.calls[0]![0].data).toMatchObject([{ ephemeralPublicKey: extra, amount: '1' }])
  })
  it('still refuses an extra prize above the declared campaign count', async () => {
    expect(await registerLinks('prizes', 'org', [key, extra], ['Winner', 'Second'])).toEqual({ kind: 'over-limit', declared: 1, adding: 1, wouldTotal: 2 })
    expect(db.claimLink.createMany).not.toHaveBeenCalled()
  })
  it('refuses duplicate keys in one request', async () => {
    expect((await registerLinks('prizes', 'org', [key, key], ['Winner', 'Winner'])).kind).toBe('budget')
    expect(db.claimLink.createMany).not.toHaveBeenCalled()
  })
  it('keeps foreign and completed campaigns inaccessible to registration', async () => {
    db.campaign.findFirst.mockResolvedValueOnce(null)
    expect(await registerLinks('prizes', 'foreign', [key])).toEqual({ kind: 'not-found' })
    campaign.status = 'ACTIVE'
    expect(await registerLinks('prizes', 'org', [key])).toEqual({ kind: 'bad-status', status: 'ACTIVE' })
    expect(db.claimLink.findMany).not.toHaveBeenCalled()
  })
})
