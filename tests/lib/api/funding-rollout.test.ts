import { beforeEach, expect, it, vi } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'

const settings = vi.hoisted(() => ({ SPONSORED_FUNDING_ENABLED: false, MAINNET_DISTRIBUTION_ENABLED: false,
  STELLAR_NETWORK: 'testnet', MAX_LINKS_PER_CAMPAIGN: 10000, LEGACY_BEARER_EMAIL_ENABLED: false, NODE_ENV: 'test' }))
const database = vi.hoisted(() => ({ campaign: { findFirst: vi.fn() }, batch: { findFirst: vi.fn(), findMany: vi.fn() } }))
vi.mock('@/lib/config/env', () => ({ env: settings }))
vi.mock('@/lib/config/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/db/client', () => ({ prisma: database }))
vi.mock('@/lib/api/approvals', () => ({ approvalGate: vi.fn(async () => null), recordSigner: vi.fn() }))
vi.mock('@/lib/api/screening', () => ({ screeningGate: vi.fn(async () => null) }))
vi.mock('@/lib/stellar/context', () => ({ campaignContextProblem: vi.fn(() => null), stellarContextProblem: vi.fn(async () => null) }))
import { newFundingProblem } from '@/lib/stellar/funding-rollout'
import { createCampaignSchema } from '@/lib/api/campaigns'
import { prepareBatch, submitBatch } from '@/lib/api/batches'
import { stellarMetadata } from '@/lib/stellar/network'

beforeEach(() => {
  settings.SPONSORED_FUNDING_ENABLED = false; settings.MAINNET_DISTRIBUTION_ENABLED = false; settings.STELLAR_NETWORK = 'testnet'
  vi.clearAllMocks()
  database.campaign.findFirst.mockResolvedValue({ id: 'campaign', network: 'testnet', fundingMode: 'SPONSORED',
    status: 'CREATING', csvExportedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) })
})

it('blocks new prepare/submit before parsing signed work but preserves recorded submission replay', async () => {
  expect(await prepareBatch('campaign', 'org', {})).toMatchObject({ kind: 'conflict', detail: expect.stringContaining('paused') })
  database.batch.findFirst.mockResolvedValue({ id: 'batch', sequence: 1, status: 'PENDING', transactionHash: null })
  expect(await submitBatch('campaign', 'org', { sequence: 1, signedXdr: 'inert' })).toMatchObject({ kind: 'conflict', detail: expect.stringContaining('paused') })
  database.batch.findFirst.mockResolvedValue({ id: 'batch', sequence: 1, status: 'SUBMITTED', transactionHash: 'public-recorded-hash' })
  expect(await submitBatch('campaign', 'org', { sequence: 1, signedXdr: 'inert' })).toMatchObject({ kind: 'ok', value: { replay: true, transactionHash: 'public-recorded-hash' } })
  expect(database.batch.findMany).not.toHaveBeenCalled()
})

it('requires separate sponsored and Mainnet opt-ins, while retaining native Testnet compatibility', () => {
  expect(newFundingProblem('testnet', 'SENDER')).toBeNull()
  expect(newFundingProblem('testnet', 'SPONSORED')).toContain('paused')
  settings.SPONSORED_FUNDING_ENABLED = true
  expect(newFundingProblem('testnet', 'SPONSORED')).toBeNull()
  expect(newFundingProblem('public', 'SPONSORED')).toContain('Mainnet')
  settings.MAINNET_DISTRIBUTION_ENABLED = true
  expect(newFundingProblem('public', 'SPONSORED')).toBeNull()
  settings.SPONSORED_FUNDING_ENABLED = false
  expect(newFundingProblem('public', 'SPONSORED')).toContain('paused')
})

it('refuses new USDC drafts through the shared schema before allocating a sponsor or data', () => {
  const terms = { name: 'Pilot', network: 'testnet', senderPublicKey: Keypair.random().publicKey(),
    assetCode: 'USDC', assetIssuer: stellarMetadata('testnet').defaultAsset.assetIssuer,
    amountPerLink: '1', linkCount: 3, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }
  expect(createCampaignSchema.safeParse(terms).success).toBe(false)
  settings.SPONSORED_FUNDING_ENABLED = true
  expect(createCampaignSchema.safeParse(terms).success).toBe(true)
  settings.STELLAR_NETWORK = 'public'
  const publicTerms = { ...terms, network: 'public', assetIssuer: stellarMetadata('public').defaultAsset.assetIssuer }
  expect(createCampaignSchema.safeParse(publicTerms).success).toBe(false)
})
