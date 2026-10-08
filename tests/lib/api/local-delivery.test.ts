import { beforeEach, expect, it, vi } from 'vitest'
import { DelayedError } from 'bullmq'

const state = vi.hoisted(() => ({ env: { LEGACY_BEARER_EMAIL_ENABLED: false, NODE_ENV: 'test', STELLAR_NETWORK: 'testnet', MAX_LINKS_PER_CAMPAIGN: 10000 },
  database: vi.fn(), queue: vi.fn() }))
vi.mock('@/lib/config/env', () => ({ env: state.env }))
vi.mock('@/lib/db/client', () => ({ prisma: { campaign: { findFirst: state.database } } }))
vi.mock('@/lib/config/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api/session-guard', () => ({ requireUser: vi.fn(async () => ({ user: { id: 'user' }, org: { id: 'org' } })), owned: vi.fn() }))
vi.mock('@/lib/queue/connection', () => ({ QUEUE: { emailDeliver: 'email' }, queueConnection: state.queue }))

import { POST } from '@/app/api/campaigns/[id]/deliver/route'
import { queueDeliveries } from '@/lib/api/deliver'
import { enqueueDelivery, type DeliveryJob } from '@/lib/queue/email'
import { holdBlockedBearerJob } from '@/workers/email'
import { legacyBearerEmailAllowed } from '@/lib/email/delivery-policy'
import { createCampaignSchema } from '@/lib/api/campaigns'
import { Keypair } from '@stellar/stellar-sdk'

beforeEach(() => {
  state.env.LEGACY_BEARER_EMAIL_ENABLED = false; state.env.NODE_ENV = 'test'; state.env.STELLAR_NETWORK = 'testnet'
  state.database.mockClear(); state.queue.mockClear()
})

it('refuses new email-only campaigns before creating unfundable claim policies', () => {
  const terms = { name: 'Local delivery', network: 'testnet', senderPublicKey: Keypair.random().publicKey(),
    assetCode: 'XLM', amountPerLink: '1', linkCount: 1, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }
  for (const claimPolicy of ['open', 'code', 'passkey']) expect(createCampaignSchema.safeParse({ ...terms, claimPolicy }).success).toBe(true)
  expect(createCampaignSchema.safeParse({ ...terms, claimPolicy: 'email' }).success).toBe(false)
  state.env.LEGACY_BEARER_EMAIL_ENABLED = true
  expect(createCampaignSchema.safeParse({ ...terms, claimPolicy: 'email' }).success).toBe(true)
  state.env.NODE_ENV = 'production'
  expect(createCampaignSchema.safeParse({ ...terms, claimPolicy: 'email' }).success).toBe(false)
})

it('refuses repeated endpoint requests before reading exceptional bodies or reserving work', async () => {
  for (let retry = 0; retry < 2; retry++) {
    const request = new Request('https://kleym.example/api/campaigns/campaign/deliver', { method: 'POST', body: 'inert private payload' })
    const read = vi.spyOn(request, 'json')
    const response = await POST(request, { params: Promise.resolve({ id: 'campaign' }) })
    expect(response.status).toBe(409)
    expect(read).not.toHaveBeenCalled()
  }
  expect(state.database).not.toHaveBeenCalled(); expect(state.queue).not.toHaveBeenCalled()
})

it('refuses service and queue ingress even with workers stopped', async () => {
  expect((await queueDeliveries('campaign', 'org', { recipients: [] })).kind).toBe('conflict')
  await expect(enqueueDelivery({} as DeliveryJob)).rejects.toThrow('disabled')
  expect(state.database).not.toHaveBeenCalled(); expect(state.queue).not.toHaveBeenCalled()
})

it('holds legacy jobs without reading their URL, sending, or removing the payload on retry', async () => {
  const payload = { linkId: 'legacy-link', get claimUrl(): string { throw new Error('Private URL must not be read') } } as DeliveryJob
  const moveToDelayed = vi.fn(async () => undefined)
  const job = { id: 'legacy-job', data: payload, moveToDelayed }
  for (let retry = 0; retry < 2; retry++) await expect(holdBlockedBearerJob(job, 'inert-lock')).rejects.toBeInstanceOf(DelayedError)
  expect(moveToDelayed).toHaveBeenCalledTimes(2)
  expect(job.data).toBe(payload)
})

it('allows secret-free email kinds, and never enables legacy bearer email in production or on public network', async () => {
  const moveToDelayed = vi.fn(async () => undefined)
  await holdBlockedBearerJob({ id: 'receipt', data: { kind: 'receipt' } as never, moveToDelayed })
  await holdBlockedBearerJob({ id: 'reminder', data: { kind: 'reminder' } as never, moveToDelayed })
  expect(moveToDelayed).not.toHaveBeenCalled()
  state.env.LEGACY_BEARER_EMAIL_ENABLED = true
  expect(legacyBearerEmailAllowed()).toBe(true)
  state.env.NODE_ENV = 'production'; expect(legacyBearerEmailAllowed()).toBe(false)
  state.env.NODE_ENV = 'test'; state.env.STELLAR_NETWORK = 'public'; expect(legacyBearerEmailAllowed()).toBe(false)
})
