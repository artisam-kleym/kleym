import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'

const mocks = vi.hoisted(() => ({
  createCampaign: vi.fn(), audit: vi.fn(), webhook: vi.fn(), transaction: vi.fn(), org: vi.fn(),
  due: vi.fn(), advance: vi.fn(), createRun: vi.fn(), findRun: vi.fn(), deleteCampaign: vi.fn(),
}))
vi.mock('@/lib/api/campaigns', async (original) => ({ ...(await original<object>()), createCampaign: mocks.createCampaign }))
vi.mock('@/lib/api/audit', () => ({ recordAudit: mocks.audit }))
vi.mock('@/lib/webhooks/emit', () => ({ emitWebhook: mocks.webhook }))
vi.mock('@/lib/db/client', () => ({ prisma: {
  $transaction: mocks.transaction,
  organization: { findUniqueOrThrow: mocks.org },
  campaign: { update: vi.fn(), delete: mocks.deleteCampaign },
  campaignTemplate: { findMany: mocks.due, updateMany: mocks.advance },
  templateRun: { create: mocks.createRun, findFirst: mocks.findRun },
} }))

import { prepareRun, runDueTemplates } from '@/lib/api/templates'

const now = new Date('2026-09-29T10:00:00Z')
const template = {
  id: 'template', organizationId: 'org', createdById: 'author', name: 'Payroll', enabled: true,
  terms: { network: 'testnet', senderPublicKey: Keypair.random().publicKey(), assetCode: 'XLM', amountPerLink: '1', expiryDays: 30 },
  recipientsCsv: 'label\nalice\n', cadence: 'daily', runHour: 9, nextRunAt: now, lastRunAt: null, createdAt: now, updatedAt: now,
} as Parameters<typeof prepareRun>[0]

beforeEach(() => {
  vi.resetAllMocks()
  mocks.createCampaign.mockResolvedValue({ id: 'campaign' })
  mocks.org.mockResolvedValue({ approvalThreshold: null, approvalsRequired: 1 })
  mocks.transaction.mockResolvedValue([])
  mocks.audit.mockResolvedValue(undefined)
  mocks.webhook.mockResolvedValue({ deliveries: 0 })
  mocks.createRun.mockResolvedValue({ id: 'run' })
  mocks.advance.mockResolvedValue({ count: 1 })
  mocks.due.mockResolvedValue([template])
  mocks.findRun.mockResolvedValue(null)
})

describe('template run failure boundaries', () => {
  it('refuses email template runs before creating durable recipient snapshots or campaigns', async () => {
    const emailTemplate = { ...template, terms: { ...(template.terms as Record<string, unknown>), claimPolicy: 'email' } }
    expect(await prepareRun(emailTemplate, 'MANUAL', now, 100, { userId: 'author', ip: null }, now)).toMatchObject({ kind: 'invalid' })
    expect(mocks.createCampaign).not.toHaveBeenCalled()
    expect(mocks.createRun).not.toHaveBeenCalled()
  })
  it('returns the prepared campaign when its post-commit audit fails', async () => {
    mocks.audit.mockRejectedValue(new Error('audit unavailable'))
    const result = await prepareRun(template, 'SCHEDULED', now, 100, { userId: 'author', ip: null }, now)
    expect(result).toMatchObject({ kind: 'ok', value: { campaignId: 'campaign' } })
    expect(mocks.deleteCampaign).not.toHaveBeenCalled()
  })

  it('reads policy before creating a campaign', async () => {
    mocks.org.mockRejectedValue(new Error('policy unavailable'))
    await expect(prepareRun(template, 'SCHEDULED', now, 100, { userId: 'author', ip: null }, now)).rejects.toThrow('policy unavailable')
    expect(mocks.createCampaign).not.toHaveBeenCalled()
  })

  it('counts a prepared run once when its notification fails, without a FAILED row', async () => {
    mocks.webhook.mockRejectedValue(new Error('notification unavailable'))
    expect(await runDueTemplates(now, 100)).toEqual({ checked: 1, prepared: 1, failed: 0 })
    expect(mocks.createRun.mock.calls.every(([args]) => args.data.status !== 'FAILED')).toBe(true)
  })
})
