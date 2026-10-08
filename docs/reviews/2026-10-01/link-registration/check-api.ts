/** Real HTTP registration/prepare gate; public fixture only, never signs/submits. */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { chromium } from '@playwright/test'
import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { prisma } from '../../../../src/lib/db/client'

assert.equal(new URL(process.env.DATABASE_URL!).hostname, '127.0.0.1')
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/kleym_app_pilot')
const origin = 'http://127.0.0.1:3220'
const sender = 'GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A'
const issuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
const name = `Registration contract probe ${randomUUID()}`
const publicKeys = [Keypair.random().publicKey(), Keypair.random().publicKey()]
const browser = await chromium.launch()
let campaignId: string | undefined
let proof: Record<string, unknown> | undefined
try {
  const context = await browser.newContext({ storageState: 'e2e/.auth/session.json' })
  const page = await context.newPage()
  await page.goto(`${origin}/campaigns/new`)
  // Browser fetch preserves loopback secure-cookie behavior; Node's standalone
  // request client does not send Secure cookies over this local HTTP origin.
  const request = { post: async (url: string, options: { headers?: Record<string, string>; data?: unknown } = {}) => {
    const result = await page.evaluate(async ({ url, options }) => {
      const response = await fetch(url, { method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', ...options.headers },
        ...(options.data === undefined ? {} : { body: JSON.stringify(options.data) }) })
      return { status: response.status, body: await response.json() }
    }, { url, options })
    return { status: () => result.status, json: async () => result.body }
  } }
  const created = await request.post(`${origin}/api/campaigns`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { name, network: 'testnet', senderPublicKey: sender, assetCode: 'USDC', assetIssuer: issuer,
      amountPerLink: '1', linkCount: 2, expiresAt: new Date(Date.now() + 30 * 60000).toISOString() },
  })
  assert.equal(created.status(), 201, 'Fixture campaign creation failed')
  campaignId = (await created.json()).id
  assert.ok(campaignId)
  const registered = await request.post(`${origin}/api/campaigns/${campaignId}/links`, {
    headers: { 'idempotency-key': randomUUID() }, data: { publicKeys, labels: [null, null] },
  })
  assert.equal(registered.status(), 201, 'Blank optional labels did not register')
  assert.deepEqual(await registered.json(), { registered: 2, total: 2 })
  const rows = await prisma.claimLink.findMany({ where: { campaignId }, select: { label: true, amount: true } })
  assert.equal(rows.length, 2)
  assert.ok(rows.every((row) => row.label === null && row.amount.toString() === '1'))
  const exported = await request.post(`${origin}/api/campaigns/${campaignId}/export`)
  assert.equal(exported.status(), 200, 'Public export acknowledgement failed')
  const prepared = await request.post(`${origin}/api/campaigns/${campaignId}/batches/prepare`, { data: {} })
  assert.equal(prepared.status(), 200, 'Funding prepare gate failed')
  const transaction = TransactionBuilder.fromXDR((await prepared.json()).xdr, Networks.TESTNET)
  assert.ok(transaction instanceof Transaction)
  assert.equal(transaction.signatures.length, 0)
  assert.deepEqual(transaction.operations.map((operation) => operation.type), [
    'beginSponsoringFutureReserves', 'createClaimableBalance', 'createClaimableBalance', 'endSponsoringFutureReserves',
  ])
  for (const operation of transaction.operations) {
    if (operation.type !== 'createClaimableBalance') continue
    assert.equal(operation.source, sender)
    assert.equal(operation.amount, '1.0000000')
    assert.equal(operation.asset.getCode(), 'USDC')
    assert.equal(operation.asset.getIssuer(), issuer)
  }
  const batches = await prisma.batch.findMany({ where: { campaignId }, select: { submittedXdr: true, transactionHash: true } })
  assert.ok(batches.every((batch) => !batch.submittedXdr && !batch.transactionHash))
  proof = { checkedAt: new Date().toISOString(), actualHttpApi: true, registrationStatus: 201,
    blankLabelsPreserved: true, twoExactUsdcLinks: true, unsignedFundingPrepared: true,
    noSenderSignature: true, noChainWrites: true, fixtureRemoved: true }
} finally {
  if (campaignId) {
    const fixture = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { name: true, batches: { select: { submittedXdr: true } } } })
    assert.ok(fixture)
    assert.equal(fixture?.name, name, 'Refusing to remove an unrelated campaign')
    assert.ok(fixture.batches.every((batch) => !batch.submittedXdr), 'Refusing to remove a submitted campaign')
    await prisma.campaign.delete({ where: { id: campaignId } })
  }
  await browser.close()
  await prisma.$disconnect()
}
assert.ok(proof)
writeFileSync('docs/reviews/2026-10-01/link-registration/after.json', JSON.stringify(proof, null, 2) + '\n')
console.log(JSON.stringify(proof))
