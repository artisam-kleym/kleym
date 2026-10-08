/** Real local HTTP/UI refusal checks. No signatures, wallet secrets or ledger writes. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { chromium, expect } from '@playwright/test'
import { Keypair } from '@stellar/stellar-sdk'
import { prisma } from '../../../../src/lib/db/client'

assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/kleym_app_pilot')
const origin = 'http://127.0.0.1:3220'
const sourceId = 'cmupcw5ey0004y8kjq7oryzzk'
const source = await prisma.campaign.findUniqueOrThrow({ where: { id: sourceId } })
const before = await prisma.campaign.count({ where: { renewalOfId: sourceId } })
assert.equal(source.status, 'RECLAIMED', 'Original refund must be settled before the positive renewal UI check')
const browser = await chromium.launch()
let fixtureId: string | undefined
let result: Record<string, unknown> | undefined
try {
  const context = await browser.newContext({ storageState: 'e2e/.auth/session.json', timezoneId: 'Asia/Manila' })
  const page = await context.newPage()
  const name = `Renewal refusal fixture ${randomUUID()}`
  const fixture = await prisma.campaign.create({ data: {
    userId: source.userId, organizationId: source.organizationId, name, network: 'testnet',
    senderPublicKey: Keypair.random().publicKey(), assetCode: 'USDC', assetIssuer: source.assetIssuer,
    amountPerLink: '1', linkCount: 1, expiresAt: new Date(Date.now() - 3600000),
  } })
  fixtureId = fixture.id
  await page.goto(`${origin}/campaigns/new?reissue=${fixtureId}`)
  await expect(page.locator('p[role="alert"]')).toContainText('Reclaim all unused funds')
  await expect(page.getByLabel('Campaign name')).toHaveCount(0)
  const refused = await page.evaluate(async (input) => {
    const r = await fetch('/api/campaigns', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input) })
    return { status: r.status, body: await r.json() }
  }, { name: 'Refused renewal probe', network: 'testnet', senderPublicKey: source.senderPublicKey, assetCode: source.assetCode,
    assetIssuer: source.assetIssuer, amountPerLink: source.amountPerLink.toFixed(), linkCount: source.linkCount,
    expiresAt: new Date(Date.now() + 3600000).toISOString(), renewalOfId: fixtureId })
  assert.equal(refused.status, 409)
  assert.match(refused.body.detail, /Reclaim all unused funds/)
  assert.equal(await prisma.campaign.count({ where: { renewalOfId: sourceId } }), before)
  await prisma.campaign.update({ where: { id: fixtureId }, data: { expiresAt: new Date(Date.now() + 3600000) } })
  await page.goto(`${origin}/campaigns/new?renew=${fixtureId}`)
  await expect(page.locator('p[role="alert"]')).toContainText('Wait for the original expiry')
  await expect(page.getByLabel('Campaign name')).toHaveCount(0)
  await page.goto(`${origin}/campaigns/new?renew=${sourceId}`)
  await expect(page.locator('p[role="alert"]')).toContainText('already has a renewal')
  await expect(page.getByLabel('Campaign name')).toHaveCount(0)
  const duplicate = await page.evaluate(async (input) => {
    const r = await fetch('/api/campaigns', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input) })
    return { status: r.status, body: await r.json() }
  }, { name: 'Refused duplicate renewal probe', network: 'testnet', senderPublicKey: source.senderPublicKey, assetCode: source.assetCode,
    assetIssuer: source.assetIssuer, amountPerLink: source.amountPerLink.toFixed(), linkCount: source.linkCount,
    expiresAt: new Date(Date.now() + 3600000).toISOString(), renewalOfId: sourceId })
  assert.equal(duplicate.status, 409)
  assert.match(duplicate.body.detail, /already has a renewal/)
  assert.equal(await prisma.campaign.count({ where: { renewalOfId: sourceId } }), before)
  await page.goto(`${origin}/campaigns/${sourceId}`)
  await expect(page.getByRole('link', { name: 'Renew returned funds', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'a linked renewal (active)', exact: true })).toHaveAttribute('href', '/campaigns/cmupd9xde0008y8kjuywfibzl')
  await expect(page.getByRole('link', { name: /^Reissue/ })).toHaveCount(0)
  const health = await page.evaluate(async () => ({ health: await (await fetch('/api/health')).json(), ready: await (await fetch('/api/ready')).json() }))
  assert.equal(health.health.status, 'ok')
  assert.equal(health.ready.ready, true)
  result = { checkedAt: new Date().toISOString(), originalCampaignId: sourceId, expiredUnrefundedHttpStatus: refused.status,
    refusedPagesHaveNoFundingWizard: true, noLiveReissueFundingAction: true, noSuccessorCreated: true,
    existingSuccessorShown: true, duplicateRenewalHttpStatus: duplicate.status, noExtraRenewalAction: true,
    originalExpiryPreserved: (await prisma.campaign.findUniqueOrThrow({ where: { id: sourceId } })).expiresAt.getTime() === source.expiresAt.getTime(),
    fixtureRemoved: true, chainWrites: 0, ...health }
} finally {
  if (fixtureId) {
    const fixture = await prisma.campaign.findUniqueOrThrow({ where: { id: fixtureId }, select: { name: true, _count: { select: { links: true, batches: true } } } })
    assert(fixture.name.startsWith('Renewal refusal fixture '))
    assert.equal(fixture._count.links, 0)
    assert.equal(fixture._count.batches, 0)
    await prisma.campaign.delete({ where: { id: fixtureId } })
  }
  await browser.close()
  await prisma.$disconnect()
}
assert(result)
writeFileSync('docs/reviews/2026-10-01/renewal/browser.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result))
