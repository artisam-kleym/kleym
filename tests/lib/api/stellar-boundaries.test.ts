import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { Account, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { env } from '@/lib/config/env'
import { assertHorizonNetwork } from '@/lib/stellar/horizon'
import { stellarContextProblem } from '@/lib/stellar/context'
import { prepareBatch, submitBatch } from '@/lib/api/batches'
import { prepareReclaim, submitReclaim } from '@/lib/api/reclaim'
import { loadClaimable, prepareMaterialise, prepareClaim, submitClaim } from '@/lib/api/claims'
import { GET } from '@/app/api/stellar/network/route'
import { KleymClient } from '../../../packages/sdk/src/client'

const db = vi.hoisted(() => ({ campaign: { findFirst: vi.fn(), findUnique: vi.fn() }, batch: { findFirst: vi.fn() }, claimLink: { findUnique: vi.fn() }, ledgerAttempt: { findUnique: vi.fn(), updateMany: vi.fn() } }))
vi.mock('@/lib/db/client', () => ({ prisma: db }))

const ephemeral = Keypair.random().publicKey()
const recipient = Keypair.random().publicKey()
const fetchMock = vi.fn<typeof fetch>()
const balanceId = `00000000${'a'.repeat(64)}`

function claimEnvelope(phase: 'claim' | 'materialise') {
  const builder = new TransactionBuilder(new Account(env.SPONSOR_PUBLIC_KEY, '100'), { networkPassphrase: Networks.TESTNET, fee: '1000' }).setTimeout(300)
  if (phase === 'materialise') {
    builder.addOperation(Operation.createAccount({ destination: ephemeral, startingBalance: '0' }))
  } else {
    builder.addOperation(Operation.claimClaimableBalance({ balanceId, source: ephemeral }))
  }
  const tx = builder.build()
  tx.sign(Keypair.fromSecret(env.SPONSOR_SECRET_KEY))
  // Current submission requires durable preparation before probing/submitting.
  // These synthetic create/claim operations are sponsor-signed fixture bodies.
  db.ledgerAttempt.findUnique.mockResolvedValue({ scope: `${phase}:link`, transactionHash: tx.hash().toString('hex'), status: 'PREPARED', metadata: { requiredSigners: [env.SPONSOR_PUBLIC_KEY] } })
  return tx
}

function rows(network: string, sponsorPublicKey: string | null = null) {
  const campaign = { id: 'campaign', network, sponsorPublicKey, status: 'ACTIVE', expiresAt: new Date(Date.now() + 86_400_000) }
  db.campaign.findFirst.mockResolvedValue(campaign)
  db.claimLink.findUnique.mockResolvedValue({ id: 'link', campaignId: 'campaign', status: 'ACTIVE', balanceId, claimTxHash: null, campaign })
  return campaign
}

beforeEach(() => {
  vi.clearAllMocks()
  db.ledgerAttempt.findUnique.mockResolvedValue(null)
  db.ledgerAttempt.updateMany.mockResolvedValue({ count: 1 })
  db.campaign.findUnique.mockResolvedValue(null)
  db.batch.findFirst.mockResolvedValue({ id: 'batch', sequence: 1, status: 'PENDING', transactionHash: null, links: [] })
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation(async () => Response.json({ network_passphrase: Networks.TESTNET }))
})
afterEach(() => vi.unstubAllGlobals())

const actions = [
  ['funding prepare', () => prepareBatch('campaign', 'org', {})],
  ['funding submit', () => submitBatch('campaign', 'org', { sequence: 1, signedXdr: 'untrusted' })],
  ['reclaim prepare', () => prepareReclaim('campaign', 'org')],
  ['reclaim submit', () => submitReclaim('campaign', 'org', { signedXdr: 'untrusted' })],
  ['claimable load', () => loadClaimable(ephemeral)],
  ['materialise prepare', () => prepareMaterialise(ephemeral)],
  ['claim prepare', () => prepareClaim(ephemeral, recipient)],
  ['claim submit', () => submitClaim(ephemeral, claimEnvelope('claim').toXDR(), 'claim')],
  ['materialise submit', () => submitClaim(ephemeral, claimEnvelope('materialise').toXDR(), 'materialise')],
] as const

describe('every monetary API entry point', () => {
  it.each(actions)('%s refuses a campaign on the other network before provider access', async (_label, action) => {
    rows('public')
    const result = await action()
    expect(['conflict', 'unavailable']).toContain(result.kind)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(actions)('%s refuses a mismatched provider before envelope/signature/submission work', async (_label, action) => {
    rows('testnet')
    fetchMock.mockResolvedValue(Response.json({ network_passphrase: Networks.PUBLIC }))
    const result = await action()
    expect(['conflict', 'unavailable']).toContain(result.kind)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    if (result.kind === 'conflict') expect(result.detail).toContain('network verification')
  })

  it('refuses a removed sponsor before reaching the provider', async () => {
    const campaign = rows('testnet', Keypair.random().publicKey())
    expect(await stellarContextProblem(campaign)).toContain('sponsor')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows the current and legacy primary binding on the verified network', async () => {
    expect(await stellarContextProblem(rows('testnet'))).toBeNull()
    expect(await stellarContextProblem(rows('testnet', env.SPONSOR_PUBLIC_KEY))).toBeNull()
  })

  it('returns a recorded funding replay during a provider outage without a new network call', async () => {
    rows('testnet')
    db.batch.findFirst.mockResolvedValue({ id: 'batch', sequence: 1, status: 'SUBMITTED', transactionHash: 'recorded-hash', links: [] })
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await submitBatch('campaign', 'org', { sequence: 1, signedXdr: 'not-used-for-recorded-replay' })).toMatchObject({ kind: 'ok', value: { transactionHash: 'recorded-hash', replay: true } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns the exact recorded claim replay during a provider outage', async () => {
    const campaign = rows('testnet')
    const tx = claimEnvelope('claim')
    const hash = tx.hash().toString('hex')
    db.ledgerAttempt.findUnique.mockResolvedValue({ scope: 'claim:link', transactionHash: hash, status: 'CONFIRMED', metadata: { requiredSigners: [env.SPONSOR_PUBLIC_KEY] } })
    db.claimLink.findUnique.mockResolvedValue({ id: 'link', campaignId: 'campaign', status: 'CLAIMED', balanceId, claimTxHash: hash, campaign })
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await submitClaim(ephemeral, tx.toXDR(), 'claim')).toMatchObject({ kind: 'ok', value: { hash, replay: true } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a signed claim with no durable prepared envelope before provider access', async () => {
    rows('testnet')
    const tx = claimEnvelope('claim')
    db.ledgerAttempt.findUnique.mockResolvedValue(null)
    expect(await submitClaim(ephemeral, tx.toXDR(), 'claim')).toMatchObject({ kind: 'conflict', detail: 'That transaction was not the prepared envelope for this link.' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('provider identity', () => {
  it('rechecks after a successful probe and refuses missing identity or an outage', async () => {
    await expect(assertHorizonNetwork()).resolves.toBeUndefined()
    fetchMock.mockResolvedValue(Response.json({}))
    await expect(assertHorizonNetwork()).rejects.toThrow('identity')
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    await expect(assertHorizonNetwork()).rejects.toThrow('could not be read')
    fetchMock.mockRejectedValue(new Error('private provider credential fixture'))
    expect(await stellarContextProblem(rows('testnet'))).toBe('Stellar network verification is temporarily unavailable. Try again shortly.')
  })

  it('coalesces concurrent probes without permanently caching success', async () => {
    await Promise.all([assertHorizonNetwork(), assertHorizonNetwork(), assertHorizonNetwork()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await assertHorizonNetwork()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('metadata consumers', () => {
  it('serves only public deployment/asset fields with no secret or provider URL', async () => {
    const response = await GET()
    const metadata = await response.json()
    expect(metadata.defaultAsset.assetCode).toBe('USDC')
    expect(metadata.network).toBe('testnet')
    expect(metadata.isRealMoney).toBe(false)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const serialized = JSON.stringify(metadata)
    expect(serialized).not.toContain(env.SPONSOR_SECRET_KEY)
    expect(serialized).not.toContain(env.HORIZON_URL)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('SDK obtains defaults from the deployment endpoint', async () => {
    const metadata = await (await GET()).json()
    fetchMock.mockResolvedValue(Response.json(metadata))
    const client = new KleymClient({ baseUrl: 'https://kleym.example', apiKey: 'safe-fixture', fetch: fetchMock })
    expect(await client.getStellarMetadata()).toEqual(metadata)
    expect(fetchMock.mock.calls[0]![0]).toBe('https://kleym.example/api/stellar/network')
  })
})
