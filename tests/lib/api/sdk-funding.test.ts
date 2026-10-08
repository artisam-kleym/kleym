import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Account, Asset, Claimant, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { expect, it } from 'vitest'
import { KleymClient } from '../../../packages/sdk/src/client'
import { createCampaignEndToEnd, FundingPendingError, resumeCampaignFunding } from '../../../packages/sdk/src/flow'

function fixture(confirmAfter = 2) {
  const sender = Keypair.random(), sponsor = Keypair.random()
  const states = [{ sequence: 1, status: 'PENDING', transactionHash: null as string | null },
    { sequence: 2, status: 'PENDING', transactionHash: null as string | null }]
  const requests: { path: string; body: string }[] = []
  let polls = 0, exported = false
  const fetchImpl: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname
    const body = String(init?.body ?? '')
    requests.push({ path, body })
    let response: unknown = {}
    if (path.endsWith('/export')) exported = true
    else if (path.endsWith('/prepare')) {
      expect(states.some((batch) => batch.status === 'SUBMITTED')).toBe(false)
      const batch = states.find((batch) => batch.status === 'PENDING')!
      const transaction = new TransactionBuilder(new Account(sponsor.publicKey(), String(100 + batch.sequence)), {
        networkPassphrase: Networks.TESTNET, fee: '1000',
      }).addOperation(Operation.createClaimableBalance({ source: sender.publicKey(), asset: new Asset('USDC', Keypair.random().publicKey()),
        amount: '1', claimants: [new Claimant(Keypair.random().publicKey(), Claimant.predicateUnconditional())] })).setTimeout(180).build()
      response = { sequence: batch.sequence, totalBatches: 2, xdr: transaction.toXDR(), networkPassphrase: Networks.TESTNET }
    } else if (path.endsWith('/submit')) {
      const payload = JSON.parse(body) as { sequence: number; signedXdr: string }
      const transaction = TransactionBuilder.fromXDR(payload.signedXdr, Networks.TESTNET)
      expect(transaction.signatures.some((signature) => sender.verify(transaction.hash(), signature.signature()))).toBe(true)
      const batch = states[payload.sequence - 1]!
      batch.status = 'SUBMITTED'; batch.transactionHash = transaction.hash().toString('hex'); polls = 0
      response = { ...batch, replay: false }
    } else if (path === '/api/v1/campaigns' && init?.method === 'POST') response = { id: 'campaign' }
    else if (init?.method === 'GET') {
      const pending = states.find((batch) => batch.status === 'SUBMITTED')
      if (pending && ++polls >= confirmAfter) pending.status = 'CONFIRMED'
      response = { id: 'campaign', status: 'CREATING', senderPublicKey: sender.publicKey(), csvExportedAt: exported ? new Date().toISOString() : null, batches: states }
    }
    return Response.json(response)
  }
  return { sender, states, requests, client: new KleymClient({ baseUrl: 'https://kleym.example', apiKey: 'inert', fetch: fetchImpl }),
    setExported: () => { exported = true } }
}

it('exports locally, submits public-only signed batches, and waits for each ledger confirmation', async () => {
  const f = fixture()
  const dir = await mkdtemp(join(tmpdir(), 'kleym-sdk-'))
  const csvPath = join(dir, 'private.csv')
  try {
    const result = await createCampaignEndToEnd({ client: f.client, senderSecret: f.sender.secret(), csvPath, appUrl: 'https://kleym.example',
      terms: { name: 'Prizes', network: 'testnet', senderPublicKey: f.sender.publicKey(), assetCode: 'USDC',
        amountPerLink: '1', linkCount: 2, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }, pollIntervalMs: 1 })
    expect(result.batches).toHaveLength(2)
    expect(f.states.every((batch) => batch.status === 'CONFIRMED')).toBe(true)
    const csv = await readFile(csvPath, 'utf8')
    expect(csv).toContain('https://kleym.example/claim#s=')
    expect(f.requests.every((request) => !/S[A-Z2-7]{55}/.test(request.body))).toBe(true)
    expect(f.requests.findIndex((request) => request.path.endsWith('/export'))).toBeLessThan(f.requests.findIndex((request) => request.path.endsWith('/prepare')))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

it('resumes a submitted campaign without a new campaign, export, preparation or payment for that batch', async () => {
  const f = fixture()
  f.setExported()
  f.states[0]!.status = 'SUBMITTED'; f.states[0]!.transactionHash = 'ab'.repeat(32)
  const result = await resumeCampaignFunding({ client: f.client, campaignId: 'campaign', senderSecret: f.sender.secret(), pollIntervalMs: 1 })
  expect(result.map((batch) => batch.sequence)).toEqual([2])
  expect(f.requests.filter((request) => request.path.endsWith('/submit')).map((request) => JSON.parse(request.body).sequence)).toEqual([2])
  expect(f.requests.some((request) => request.path.endsWith('/export') || request.path.endsWith('/links') || request.path === '/api/v1/campaigns')).toBe(false)
})

it('returns an explicit pending result without replacing an unknown transaction', async () => {
  const f = fixture(Infinity)
  f.setExported(); f.states[0]!.status = 'SUBMITTED'; f.states[0]!.transactionHash = 'cd'.repeat(32)
  await expect(resumeCampaignFunding({ client: f.client, campaignId: 'campaign', senderSecret: f.sender.secret(),
    confirmationTimeoutMs: 5, pollIntervalMs: 1 })).rejects.toBeInstanceOf(FundingPendingError)
  expect(f.requests.every((request) => request.body === '')).toBe(true)
})

it('refuses a missing CSV attestation or different signing wallet before preparing', async () => {
  const f = fixture()
  await expect(resumeCampaignFunding({ client: f.client, campaignId: 'campaign', senderSecret: f.sender.secret() })).rejects.toThrow('original CSV')
  f.setExported()
  await expect(resumeCampaignFunding({ client: f.client, campaignId: 'campaign', senderSecret: Keypair.random().secret() })).rejects.toThrow('signing wallet')
})
