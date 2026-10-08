/** Real PostgreSQL and separate Node processes, simulated Horizon reads; no chain writes. */
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()
assert.equal(process.env.NODE_ENV, 'test')
const verificationDb = new URL(process.env.DATABASE_URL!)
assert(verificationDb.pathname === '/kleym_verify_96' ||
  (process.env.CI === 'true' && verificationDb.hostname === 'localhost' && verificationDb.pathname === '/kleym'),
  'Use the isolated verification database or the disposable CI service')
const source = Keypair.fromSecret(process.env.SPONSOR_SECRET_KEY!), second = Keypair.random(), destination = Keypair.random().publicKey()
const wallets = new Map([source, second].map((key) => [key.publicKey(), { sequence: '10', native: '100', selling: '0' }]))
let chainWrites = 0
const server = createServer((request, response) => {
  response.setHeader('content-type', 'application/json')
  const url = new URL(request.url!, 'http://127.0.0.1')
  if (request.method !== 'GET') { chainWrites++; response.writeHead(405); response.end('{}'); return }
  const wallet = wallets.get(url.pathname.split('/').at(-1)!)
  if (url.pathname.startsWith('/accounts/') && wallet) response.end(JSON.stringify({ account_id: url.pathname.split('/').at(-1),
    sequence: wallet.sequence, subentry_count: 0, num_sponsoring: 0, num_sponsored: 0,
    balances: [{ asset_type: 'native', balance: wallet.native, selling_liabilities: wallet.selling }] }))
  else if (url.pathname === '/ledgers') response.end(JSON.stringify({ _embedded: { records: [{ sequence: 1000,
    closed_at: new Date().toISOString(), base_reserve_in_stroops: 5000000 }] } }))
  else if (url.pathname === '/') response.end(JSON.stringify({ network_passphrase: Networks.TESTNET }))
  else { response.writeHead(404); response.end('{"status":404}') }
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address(); assert(address && typeof address !== 'string')
process.env.HORIZON_URL = `http://127.0.0.1:${address.port}/`
const { prisma } = await import('../src/lib/db/client')
const { prepareAttempt, executeAttempt, lookupAttempt } = await import('../src/lib/stellar/attempts')
const { SourceCoordinationError } = await import('../src/lib/stellar/source-coordination')
const { confirmOne } = await import('../src/workers/batch-confirm')
const { prepareReclaim, submitReclaim } = await import('../src/lib/api/reclaim')
const { batchConfirmQueue } = await import('../src/lib/queue/batch-confirm')
const { redis } = await import('../src/lib/redis/client')
const user = await prisma.user.create({ data: { username: `source-${randomUUID()}`, passwordHash: 'fixture', role: 'SENDER' } })
const org = await personalOrg(prisma, user.id)
const campaign = await prisma.campaign.create({ data: { userId: user.id, organizationId: org, name: 'Source fixture',
  network: 'testnet', sponsorPublicKey: source.publicKey(), senderPublicKey: source.publicKey(), fundingMode: 'SPONSORED',
  assetCode: 'USDC', assetIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', amountPerLink: '1', linkCount: 1,
  expiresAt: new Date(Date.now() + 3600000) } })
const passed: string[] = []
function check(name: string, value: unknown) { assert(value, name); passed.push(name); console.log(`PASS ${name}`) }
function body(key = source, seconds = 180, native = '0.0000001') {
  return new TransactionBuilder(new Account(key.publicKey(), wallets.get(key.publicKey())!.sequence), { fee: '1000', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination, asset: Asset.native(), amount: native })).setTimeout(seconds).build()
}
async function refused(run: () => Promise<unknown>) {
  try { await run(); return false } catch (error) { return error instanceof SourceCoordinationError }
}
async function clear() { await prisma.ledgerAttempt.deleteMany({ where: { campaignId: campaign.id } }); await prisma.batch.deleteMany({ where: { campaignId: campaign.id } }) }
function child(scope: string, xdr: string) {
  const processChild = fork('scripts/verify-source-coordination-child.ts', [], { execArgv: ['--import', 'tsx'],
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: process.env })
  let release!: () => void
  const ready = new Promise<void>((resolve, reject) => {
    processChild.on('error', reject)
    processChild.once('message', (message: { ready?: boolean }) => {
      assert(message.ready); release = () => processChild.send({ scope, campaignId: campaign.id, xdr }); resolve()
    })
  })
  const result = new Promise<{ ok: boolean; coordination?: boolean; hash?: string }>((resolve, reject) => {
    processChild.on('message', (message: { ready?: boolean; ok: boolean; coordination?: boolean; hash?: string }) => { if (!message.ready) resolve(message) })
    processChild.on('error', reject)
    processChild.on('exit', (code) => { if (code) reject(new Error('Separate process fixture failed')) })
  })
  return { ready, result, release: () => release() }
}

try {
  const transaction = body()
  const a = child('fixture-source:a', transaction.toXDR()), b = child('fixture-source:b', transaction.toXDR())
  await Promise.all([a.ready, b.ready]); a.release(); b.release()
  const race = await Promise.all([a.result, b.result])
  check('two independent processes admit exactly one owner of a shared source', race.filter((r) => r.ok).length === 1 && race.filter((r) => r.coordination).length === 1)
  check('only one durable preparation exists after the process race', await prisma.ledgerAttempt.count({ where: { campaignId: campaign.id } }) === 1)
  const prior = await prisma.ledgerAttempt.findFirstOrThrow({ where: { campaignId: campaign.id } })
  check('same-owner preparation reuses the original body', (await prepareAttempt(prior.scope, campaign.id, 'CLAIM', transaction.toXDR(), {})).preparedXdr === prior.preparedXdr)
  check('a different source can prepare independently', !!await prepareAttempt('fixture-source:other', campaign.id, 'CLAIM', body(second).toXDR(), {}))
  await clear()

  const pending = await prisma.batch.create({ data: { campaignId: campaign.id, sequence: 1, preparedXdr: transaction.toXDR() } })
  check('funding preparation blocks claim/refund admission on the same source', await refused(() => prepareAttempt('fixture-source:claim', campaign.id, 'CLAIM', transaction.toXDR(), {})))
  await prisma.batch.update({ where: { id: pending.id }, data: { preparedXdr: null, status: 'SUBMITTED', transactionHash: 'a'.repeat(64) } })
  check('historical submitted funding without saved XDR still reserves its bound source', await refused(() => prepareAttempt('fixture-source:claim', campaign.id, 'CLAIM', transaction.toXDR(), {})))
  await clear()

  const expired = TransactionBuilder.cloneFrom(transaction, { fee: '1000',
    timebounds: { minTime: 0, maxTime: Math.floor(Date.now() / 1000) - 30 } }).build()
  const expiredHash = expired.hash().toString('hex')
  await prisma.ledgerAttempt.create({ data: { scope: 'fixture-source:expired', campaignId: campaign.id, kind: 'CLAIM',
    preparedXdr: expired.toXDR(), transactionHash: expiredHash, metadata: {} } })
  await prepareAttempt('fixture-source:next', campaign.id, 'CLAIM', transaction.toXDR(), {})
  check('expired unsigned preparation releases capacity for a new owner', await prisma.ledgerAttempt.count({ where: { campaignId: campaign.id } }) === 2)
  const old = await prisma.ledgerAttempt.findUniqueOrThrow({ where: { scope: 'fixture-source:expired' } })
  check('late submission cannot regain an expired unsigned reservation', await refused(() => executeAttempt(old, expired, async () => { throw new Error('Must not submit') })))
  check('refused late submission leaves the journal unsigned', (await prisma.ledgerAttempt.findUniqueOrThrow({ where: { scope: old.scope } })).status === 'PREPARED')
  await clear()

  expired.sign(source)
  const uncertain = await prisma.ledgerAttempt.create({ data: { scope: 'fixture-source:uncertain', campaignId: campaign.id, kind: 'CLAIM',
    preparedXdr: expired.toXDR(), submittedXdr: expired.toXDR(), transactionHash: expiredHash, status: 'SUBMITTED', metadata: {} } })
  check('expired uncertain submission blocks another owner until hash recovery', await refused(() => prepareAttempt('fixture-source:next', campaign.id, 'CLAIM', transaction.toXDR(), {})))
  const resolved = await executeAttempt(uncertain, expired, async () => { throw new Error('Expired envelope must not submit') }, lookupAttempt)
  check('exact hash checks after a closed ledger beyond expiry retire the uncertain attempt', !resolved.successful &&
    (await prisma.ledgerAttempt.findUniqueOrThrow({ where: { scope: uncertain.scope } })).status === 'FAILED')
  check('proven expiry releases the source for a new preparation', !!await prepareAttempt('fixture-source:next', campaign.id, 'CLAIM', transaction.toXDR(), {}))
  await clear()

  const timedOut = await prepareAttempt('fixture-source:timeout', campaign.id, 'CLAIM', transaction.toXDR(), {})
  transaction.sign(source)
  await assert.rejects(executeAttempt(timedOut, transaction, async () => { throw new Error('Response lost') }, async () => null))
  check('lost response retains exact submitted bytes and source ownership', (await prisma.ledgerAttempt.findUniqueOrThrow({ where: { scope: timedOut.scope } })).submittedXdr === transaction.toXDR() &&
    await refused(() => prepareAttempt('fixture-source:next', campaign.id, 'CLAIM', body().toXDR(), {})))
  const saved = await prisma.ledgerAttempt.findUniqueOrThrow({ where: { scope: timedOut.scope } })
  let resend = 0
  const recovered = await executeAttempt(saved, transaction, async () => { resend++; throw new Error('Must not resend') },
    async (hash) => ({ hash, successful: true, ledger: 1000 }))
  check('original-hash confirmation recovers without a second submission', recovered.successful && resend === 0)
  await clear()

  const wallet = wallets.get(source.publicKey())!
  wallet.native = '5'; wallet.selling = '3'
  check('selling liabilities reduce spendable XLM and refuse overcommit', await refused(() => prepareAttempt('fixture-source:capacity', campaign.id, 'CLAIM', body(source, 180, '2').toXDR(), {})))
  check('capacity refusal writes no prepared reservation', await prisma.ledgerAttempt.count({ where: { campaignId: campaign.id } }) === 0)
  wallet.selling = '0'
  const spend = body(source, 180, '2')
  const capacity = await prepareAttempt('fixture-source:capacity', campaign.id, 'CLAIM', spend.toXDR(), {})
  wallet.native = '2'
  check('submission rechecks capacity after wallet review', await refused(() => executeAttempt(capacity, spend, async () => { throw new Error('Must not submit') })))
  check('capacity refusal preserves the original unsigned body', (await prisma.ledgerAttempt.findUniqueOrThrow({ where: { scope: capacity.scope } })).status === 'PREPARED')
  wallet.native = '5'; wallet.sequence = '11'
  check('stale signed sequence is refused before network admission', await refused(() => executeAttempt(capacity, spend, async () => { throw new Error('Must not submit') })))
  const replacement = await prepareAttempt(capacity.scope, campaign.id, 'CLAIM', body(source, 180, '2').toXDR(), {})
  check('only an unsigned stale body can be refreshed with the current sequence', replacement.transactionHash !== capacity.transactionHash)
  await clear()

  await prisma.batch.create({ data: { campaignId: campaign.id, sequence: 1, preparedXdr: expired.toXDR(), submittedXdr: expired.toXDR(),
    status: 'SUBMITTED', transactionHash: expiredHash, submittedAt: new Date() } })
  const batch = await prisma.batch.findFirstOrThrow({ where: { campaignId: campaign.id } })
  check('worker retires uncertain funding only after hash and closed-ledger expiry proof', await confirmOne(batch.id) === 'failed')
  check('expired funding releases the shared source', !!await prepareAttempt('fixture-source:after-fund', campaign.id, 'CLAIM', body().toXDR(), {}))
  await clear()

  await prisma.campaign.update({ where: { id: campaign.id }, data: { fundingMode: 'SENDER', status: 'EXPIRED', expiresAt: new Date(Date.now() - 1000) } })
  const balanceId = '00000000' + 'fa'.repeat(32)
  await prisma.claimLink.create({ data: { campaignId: campaign.id, ephemeralPublicKey: Keypair.random().publicKey(),
    amount: '1', balanceId, status: 'ACTIVE' } })
  let refunded = false, refunds = 0
  const deps = { readBalances: async () => new Map(refunded ? [] : [[balanceId, '1']]),
    loadAccount: async (key: string) => new Account(key, wallets.get(key)!.sequence),
    lookup: async () => null,
    submit: async () => { refunded = true; refunds++; return { feeCharged: '100' } } }
  const unprepared = new TransactionBuilder(new Account(source.publicKey(), wallet.sequence), { fee: '1000', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.claimClaimableBalance({ balanceId })).setTimeout(180).build()
  unprepared.sign(source)
  check('unprepared legacy refund is refused before submission', (await submitReclaim(campaign.id, org, { signedXdr: unprepared.toXDR() }, deps)).kind === 'conflict' && refunds === 0)
  const legacy = await prepareReclaim(campaign.id, org, deps)
  assert(legacy.kind === 'ok')
  const legacyBody = TransactionBuilder.fromXDR(legacy.value.xdr, Networks.TESTNET)
  legacyBody.sign(source)
  const refund = await submitReclaim(campaign.id, org, { signedXdr: legacyBody.toXDR() }, deps)
  check('legacy sender-paid refund passes through durable source admission', refund.kind === 'ok' && refunds === 1 &&
    (await prisma.ledgerAttempt.findUniqueOrThrow({ where: { scope: `reclaim:${campaign.id}` } })).status === 'SETTLED')
  await prisma.ledgerAttempt.deleteMany({ where: { campaignId: campaign.id } })
  const replay = await submitReclaim(campaign.id, org, { signedXdr: legacyBody.toXDR() }, deps)
  check('historical settled refund receipt replays without a journal or another payment', replay.kind === 'ok' && replay.value.replay && refunds === 1)
  check('all concurrency and recovery proofs made zero chain writes', chainWrites === 0)
  console.log(`${passed.length} source coordination checks passed.`)
  if (process.env.VERIFY_RESULT_FILE) writeFileSync(process.env.VERIFY_RESULT_FILE,
    JSON.stringify({ checkedAt: new Date().toISOString(), checks: passed.length, passed, horizon: 'simulated', chainWrites }, null, 2) + '\n')
} finally {
  await prisma.campaign.delete({ where: { id: campaign.id } })
  await prisma.organization.delete({ where: { id: org } })
  await prisma.user.delete({ where: { id: user.id } })
  await batchConfirmQueue().close()
  await prisma.$disconnect(); redis.disconnect()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}
