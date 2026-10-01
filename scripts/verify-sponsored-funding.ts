/** Real Postgres and real signatures; loopback Horizon simulates a lost response. No chain writes. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()
assert.equal(process.env.NODE_ENV, 'test')
const sender = Keypair.random()
const sponsor = Keypair.fromSecret(process.env.SPONSOR_SECRET_KEY!)
let principal = '100'
let spendable = '100'
let submissions = 0
let indexed = false
let latest: Transaction | null = null
const fixture = JSON.parse(readFileSync('tests/fixtures/sponsored-balance-id.json', 'utf8').replace(/^\uFEFF/, '')) as { resultXdr: string; balanceIds: string[] }
function balance(id: string) {
  const index = [1, 2].find((i) => latest?.getClaimableBalanceId(i) === id)
  const operation = index === undefined ? null : latest?.operations[index]
  if (operation?.type !== 'createClaimableBalance') return null
  return { id, asset: `USDC:${issuer}`, amount: operation.amount, sponsor: sponsor.publicKey(), claimants: operation.claimants.map((c) => ({ destination: c.destination, predicate: { unconditional: true } })) }
}
const server = createServer(async (request, response) => {
  response.setHeader('content-type', 'application/json')
  if (request.method === 'POST' && request.url === '/transactions') {
    let body = ''
    for await (const chunk of request) body += chunk
    const tx = TransactionBuilder.fromXDR(new URLSearchParams(body).get('tx')!, Networks.TESTNET) as Transaction
    assert.equal(tx.source, sponsor.publicKey())
    for (const key of [sender, sponsor]) {
      assert(tx.signatures.some((s) => s.hint().equals(key.signatureHint()) && key.verify(tx.hash(), s.signature())))
    }
    submissions++
    latest = tx
    if (submissions > 1) {
      indexed = true
      response.end(JSON.stringify({ hash: tx.hash().toString('hex') }))
      return
    }
    // Horizon accepted it but its response disappeared at a gateway.
    response.writeHead(504)
    response.end(JSON.stringify({ status: 504, title: 'Fixture response lost' }))
    return
  }
  let record: unknown
  if (request.url === '/') record = { network_passphrase: Networks.TESTNET }
  else if (request.url?.startsWith('/transactions/')) {
    if (indexed && latest) {
      const result = Buffer.from(fixture.resultXdr, 'base64')
      for (const i of [1, 2]) {
        const old = Buffer.from(fixture.balanceIds[i - 1]!, 'hex')
        const offset = result.indexOf(old)
        assert(offset >= 0, 'known fixture balance ID appears in result')
        Buffer.from(latest.getClaimableBalanceId(i), 'hex').copy(result, offset)
      }
      record = { hash: latest.hash().toString('hex'), successful: true, result_xdr: result.toString('base64') }
    } else { response.writeHead(404); record = { status: 404 } }
  }
  else if (request.url?.startsWith('/claimable_balances/')) {
    const id = new URL(request.url, 'http://127.0.0.1').pathname.split('/').at(-1)!
    record = balance(id)
    assert(record, `Fixture balance missing: ${id}; expected ${latest?.getClaimableBalanceId(1)}, ${latest?.getClaimableBalanceId(2)}`)
  }
  else if (request.url?.startsWith('/ledgers?')) record = { _embedded: { records: [{ base_reserve_in_stroops: 5000000 }] } }
  else if (request.url === `/accounts/${sender.publicKey()}` || request.url === `/accounts/${sponsor.publicKey()}`) {
    const isSender = request.url.endsWith(sender.publicKey())
    record = { account_id: isSender ? sender.publicKey() : sponsor.publicKey(), sequence: '100', subentry_count: isSender ? 1 : 0, num_sponsored: isSender ? 3 : 0, num_sponsoring: 0,
      balances: [{ asset_type: 'native', balance: isSender ? '0' : spendable, selling_liabilities: '0' }, ...(isSender ? [{ asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: issuer, balance: principal, selling_liabilities: '0' }] : [])] }
  } else { response.writeHead(404); record = { status: 404 } }
  response.end(JSON.stringify(record))
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert(address && typeof address !== 'string')
process.env.HORIZON_URL = `http://127.0.0.1:${address.port}/`
const { prisma } = await import('../src/lib/db/client')
const { prepareBatch, submitBatch } = await import('../src/lib/api/batches')
const { confirmOne } = await import('../src/workers/batch-confirm')
const { recoverSubmittedFunding, batchConfirmQueue, batchConfirmJobId } = await import('../src/lib/queue/batch-confirm')
const { stellarMetadata } = await import('../src/lib/stellar/network')
const issuer = stellarMetadata('testnet').defaultAsset.assetIssuer
let userId: string | undefined
let queuedJobId: string | undefined
let checks = 0
function check(name: string, condition: unknown) { assert(condition, name); checks++; console.log(`PASS ${name}`) }
try {
  const user = await prisma.user.create({ data: { username: `funding-${randomUUID()}`, passwordHash: 'fixture', role: 'SENDER' } })
  userId = user.id
  const org = await personalOrg(prisma, user.id)
  const campaign = await prisma.campaign.create({ data: { userId: user.id, organizationId: org, name: 'Sponsored funding fixture', network: 'testnet', fundingMode: 'SPONSORED', sponsorPublicKey: sponsor.publicKey(), senderPublicKey: sender.publicKey(), assetCode: 'USDC', assetIssuer: issuer, amountPerLink: '1', linkCount: 2, expiresAt: new Date(Date.now() + 86400000), csvExportedAt: new Date() } })
  await prisma.claimLink.createMany({ data: [1, 2].map((i) => ({ campaignId: campaign.id, ephemeralPublicKey: Keypair.random().publicKey(), amount: `${i}` })) })
  check('foreign organisation cannot prepare', (await prepareBatch(campaign.id, 'foreign', {})).kind === 'not-found')
  await prisma.campaign.update({ where: { id: campaign.id }, data: { csvExportedAt: null } })
  check('funding refuses before the local backup is recorded', (await prepareBatch(campaign.id, org, {})).kind === 'conflict')
  await prisma.campaign.update({ where: { id: campaign.id }, data: { csvExportedAt: new Date() } })
  principal = '2'
  check('insufficient USDC refuses before wallet signing', (await prepareBatch(campaign.id, org, {})).kind === 'conflict')
  principal = '100'; spendable = '1'
  check('insufficient sponsor capacity refuses', (await prepareBatch(campaign.id, org, {})).kind === 'conflict')
  spendable = '100'
  const prepared = await prepareBatch(campaign.id, org, {})
  assert.equal(prepared.kind, 'ok')
  if (prepared.kind !== 'ok') throw new Error('prepare refused')
  check('reserve is two claimant units per link and sponsor pays', prepared.value.reserve === '2' && prepared.value.reservePayer === sponsor.publicKey())
  const repeat = await prepareBatch(campaign.id, org, {})
  check('repeated preparation preserves exact body', repeat.kind === 'ok' && repeat.value.xdr === prepared.value.xdr)
  const tx = TransactionBuilder.fromXDR(prepared.value.xdr, Networks.TESTNET) as Transaction
  tx.sign(sender)
  check('unsigned sender refuses', (await submitBatch(campaign.id, org, { sequence: 1, signedXdr: prepared.value.xdr })).kind === 'conflict')
  const another = new TransactionBuilder(new (await import('@stellar/stellar-sdk')).Account(sponsor.publicKey(), '101'), { fee: '1000', networkPassphrase: Networks.TESTNET })
  for (const op of tx.toEnvelope().v1().tx().operations()) another.addOperation(op)
  const altered = another.setTimeout(600).build(); altered.sign(sender)
  check('a signed replacement sequence never gets cosigned', (await submitBatch(campaign.id, org, { sequence: 1, signedXdr: altered.toXDR() })).kind === 'conflict' && submissions === 0)
  const submitted = await submitBatch(campaign.id, org, { sequence: 1, signedXdr: tx.toXDR() })
  check('uncertain response keeps submitted status', submitted.kind === 'ok' && submitted.value.status === 'SUBMITTED')
  const row = await prisma.batch.findFirstOrThrow({ where: { campaignId: campaign.id } })
  check('hash and exact fully signed envelope survive the response failure', row.transactionHash === tx.hash().toString('hex') && !!row.submittedXdr)
  const replay = await submitBatch(campaign.id, org, { sequence: 1, signedXdr: tx.toXDR() })
  check('replay never creates a second Horizon submission', replay.kind === 'ok' && replay.value.replay && submissions === 1)
  const pending = await prisma.claimLink.findMany({ where: { campaignId: campaign.id } })
  check('submission cannot activate links or assign balance IDs', pending.every((l) => l.status === 'PENDING' && l.balanceId === null))
  queuedJobId = batchConfirmJobId(row.id, row.transactionHash!)
  check('restart repairs a missing confirmation job', await recoverSubmittedFunding(campaign.id) === 1 && !!await batchConfirmQueue().getJob(queuedJobId))
  const firstJob = await batchConfirmQueue().getJob(queuedJobId)
  await recoverSubmittedFunding(campaign.id)
  check('recovery does not duplicate the same transaction job', (await batchConfirmQueue().getJob(queuedJobId))?.id === firstJob?.id)
  check('a replacement attempt gets a distinct confirmation job', queuedJobId !== batchConfirmJobId(row.id, '00'.repeat(32)))
  check('another batch cannot be prepared during uncertainty', (await prepareBatch(campaign.id, org, {})).kind === 'conflict')
  await assert.rejects(() => confirmOne(row.id))
  check('worker safely resends the identical signed hash', submissions === 2 && indexed && latest!.hash().toString('hex') === row.transactionHash)
  check('confirmation still requires a ledger read', (await prisma.batch.findUniqueOrThrow({ where: { id: row.id } })).status === 'SUBMITTED')
  check('worker confirms once the ledger indexes the funding', await confirmOne(row.id) === 'confirmed')
  const activated = await prisma.claimLink.findMany({ where: { campaignId: campaign.id } })
  check('each active link is matched to its own on-ledger claimant', activated.every((l) => l.status === 'ACTIVE' && balance(l.balanceId!)?.claimants.some((c) => c.destination === l.ephemeralPublicKey)))
  check('campaign becomes active with its backup recorded', (await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status === 'ACTIVE')
  check('repeated worker confirmation is a no-op', await confirmOne(row.id) === 'already-settled')
  console.log(`${checks} sponsored funding checks passed.`)
} finally {
  if (queuedJobId) await (await batchConfirmQueue().getJob(queuedJobId))?.remove()
  await batchConfirmQueue().close()
  if (userId) {
    await prisma.campaign.deleteMany({ where: { userId } })
    await prisma.organization.deleteMany({ where: { id: `org_${userId}` } })
    await prisma.user.delete({ where: { id: userId } })
  }
  await prisma.$disconnect()
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
