/** Real app services, database, queue and SDK signatures; simulated Horizon only. No chain writes. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Account, Keypair, Networks, Operation, Transaction, TransactionBuilder, xdr } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()
assert.equal(process.env.NODE_ENV, 'test')
const sponsor = Keypair.fromSecret(process.env.SPONSOR_SECRET_KEY!)
const sender = Keypair.random()
const issuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
const asset = `USDC:${issuer}`
type Wallet = { sequence: string; usdc: string; trusts: boolean; native: string; sponsored: number }
const accounts = new Map<string, Wallet>([
  [sponsor.publicKey(), { sequence: '100', usdc: '0', trusts: false, native: '10000', sponsored: 0 }],
  [sender.publicKey(), { sequence: '100', usdc: '20', trusts: true, native: '0', sponsored: 3 }],
])
type Balance = { id: string; asset: string; amount: string; sponsor: string; claimants: { destination: string; predicate: unknown }[] }
const balances = new Map<string, Balance>()
const records = new Map<string, { hash: string; successful: boolean; ledger: number; result_xdr: string }>()
let ledger = 1000
let submissions = 0
let loseResponse = false
let hideRecords = false
let rejectNext = false
const publicFunding = JSON.parse(readFileSync('tests/fixtures/sponsored-balance-id.json', 'utf8').replace(/^\uFEFF/, '')) as { resultXdr: string; balanceIds: string[] }
function resultOf(transaction: Transaction): string {
  if (transaction.operations.some((operation) => operation.type === 'createClaimableBalance')) {
    const bytes = Buffer.from(publicFunding.resultXdr, 'base64')
    for (const index of [1, 2]) {
      const offset = bytes.indexOf(Buffer.from(publicFunding.balanceIds[index - 1]!, 'hex'))
      assert(offset >= 0)
      Buffer.from(transaction.getClaimableBalanceId(index), 'hex').copy(bytes, offset)
    }
    return bytes.toString('base64')
  }
  // Minimal simulated result: the fee is exact; operation effects are asserted
  // below. This is not presented as a real Stellar ledger result.
  return new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString(String(transaction.operations.length * 100)),
    result: xdr.TransactionResultResult.txSuccess([]), ext: new xdr.TransactionResultExt(0) }).toXDR('base64')
}
function apply(transaction: Transaction) {
  assert.equal(transaction.source, sponsor.publicKey(), 'sponsor is every transaction fee payer')
  const required = new Set([transaction.source, ...transaction.operations.map((operation) => operation.source ?? transaction.source)])
  for (const publicKey of required) {
    const key = Keypair.fromPublicKey(publicKey)
    assert(transaction.signatures.some((signature) => signature.hint().equals(key.signatureHint()) && key.verify(transaction.hash(), signature.signature())), 'all operation sources signed')
  }
  const sponsorAccount = accounts.get(sponsor.publicKey())!
  assert.equal(transaction.sequence, String(BigInt(sponsorAccount.sequence) + 1n))
  sponsorAccount.sequence = transaction.sequence
  sponsorAccount.native = new Decimal(sponsorAccount.native).minus(new Decimal(transaction.operations.length * 100).div(1e7)).toFixed(7)
  for (const [index, operation] of transaction.operations.entries()) {
    const source = operation.source ?? transaction.source
    if (operation.type === 'createClaimableBalance') {
      assert.equal(source, sender.publicKey())
      const id = transaction.getClaimableBalanceId(index)
      balances.set(id, { id, asset, amount: operation.amount, sponsor: sponsor.publicKey(), claimants: operation.claimants.map((claimant) => ({ destination: claimant.destination, predicate: claimant.predicate })) })
      const account = accounts.get(source)!
      account.usdc = new Decimal(account.usdc).minus(operation.amount).toFixed(7)
    } else if (operation.type === 'createAccount') {
      assert.equal(operation.startingBalance, '0.0000000')
      accounts.set(operation.destination, { sequence: String(BigInt(ledger) << 32n), usdc: '0', trusts: false, native: '0', sponsored: 2 })
    } else if (operation.type === 'changeTrust') {
      const account = accounts.get(source)!
      account.trusts = operation.limit !== '0.0000000'
      account.sponsored += account.trusts ? 1 : -1
      if (!account.trusts) assert(new Decimal(account.usdc).isZero(), 'trustline cleared only after full payment')
    } else if (operation.type === 'claimClaimableBalance') {
      const balance = balances.get(operation.balanceId)
      assert(balance, 'balance must exist')
      assert(balance.claimants.some((claimant) => claimant.destination === source))
      const account = accounts.get(source)!
      account.usdc = new Decimal(account.usdc).plus(balance.amount).toFixed(7)
      balances.delete(operation.balanceId)
    } else if (operation.type === 'payment') {
      assert.equal(operation.asset.getCode(), 'USDC')
      const from = accounts.get(source)!, to = accounts.get(operation.destination)!
      assert(to.trusts)
      from.usdc = new Decimal(from.usdc).minus(operation.amount).toFixed(7)
      to.usdc = new Decimal(to.usdc).plus(operation.amount).toFixed(7)
    } else if (operation.type === 'accountMerge') {
      const account = accounts.get(source)!
      assert(new Decimal(account.usdc).isZero() && !account.trusts, 'temporary account is empty before merge')
      assert(new Decimal(account.native).isZero(), 'no recipient XLM top-up')
      accounts.delete(source)
    }
  }
}
const server = createServer(async (request, response) => {
  response.setHeader('content-type', 'application/json')
  const url = new URL(request.url!, 'http://127.0.0.1')
  let record: unknown
  if (request.method === 'POST' && url.pathname === '/transactions') {
    let body = ''
    for await (const chunk of request) body += chunk
    const transaction = TransactionBuilder.fromXDR(new URLSearchParams(body).get('tx')!, Networks.TESTNET) as Transaction
    const hash = transaction.hash().toString('hex')
    if (rejectNext) {
      rejectNext = false
      response.writeHead(400)
      response.end(JSON.stringify({ status: 400, extras: { result_codes: { transaction: 'tx_insufficient_fee' } } }))
      return
    }
    if (!records.has(hash)) {
      submissions++
      apply(transaction)
      records.set(hash, { hash, successful: true, ledger, result_xdr: resultOf(transaction) })
    }
    if (loseResponse) { response.writeHead(504); record = { status: 504 }; loseResponse = false }
    else record = records.get(hash)
  } else if (url.pathname === '/') record = { network_passphrase: Networks.TESTNET }
  else if (url.pathname.startsWith('/transactions/')) record = hideRecords ? null : records.get(url.pathname.split('/').at(-1)!)
  else if (url.pathname.startsWith('/claimable_balances/')) record = balances.get(url.pathname.split('/').at(-1)!)
  else if (url.pathname === '/ledgers') record = { _embedded: { records: [{ sequence: ledger, closed_at: new Date().toISOString(), base_reserve_in_stroops: 5000000 }] } }
  else if (url.pathname.startsWith('/accounts/')) {
    const key = url.pathname.split('/').at(-1)!
    const wallet = accounts.get(key)
    if (wallet) record = { account_id: key, sequence: wallet.sequence, data: {}, data_attr: {}, subentry_count: wallet.trusts ? 1 : 0,
      num_sponsored: wallet.sponsored, num_sponsoring: key === sponsor.publicKey() ? balances.size * 2 + [...accounts.values()].filter((account) => account.native === '0' && account.sequence !== '100').reduce((sum, account) => sum + account.sponsored, 0) : 0,
      balances: [{ asset_type: 'native', balance: wallet.native, selling_liabilities: '0' },
        ...(wallet.trusts ? [{ asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: issuer, balance: wallet.usdc, selling_liabilities: '0' }] : [])] }
  }
  if (!record) { response.writeHead(404); record = { status: 404 } }
  response.end(JSON.stringify(record))
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert(address && typeof address !== 'string')
process.env.HORIZON_URL = `http://127.0.0.1:${address.port}/`
const { prisma } = await import('../src/lib/db/client')
const { redis } = await import('../src/lib/redis/client')
const { prepareBatch, submitBatch } = await import('../src/lib/api/batches')
const { confirmOne } = await import('../src/workers/batch-confirm')
const { batchConfirmQueue } = await import('../src/lib/queue/batch-confirm')
const { prepareMaterialise, prepareClaim, submitClaim } = await import('../src/lib/api/claims')
const { prepareReclaim, submitReclaim } = await import('../src/lib/api/reclaim')
const { parseAttempt } = await import('../src/lib/stellar/attempts')
let checks = 0
function check(name: string, condition: unknown) { assert(condition, name); checks++; console.log(`PASS ${name}`) }
function signed(envelope: string, key: Keypair) { const transaction = parseAttempt(envelope); transaction.sign(key); return transaction.toXDR() }
const user = await prisma.user.create({ data: { username: `lifecycle-${randomUUID()}`, passwordHash: 'fixture', role: 'SENDER' } })
const organizationId = await personalOrg(prisma, user.id)
try {
  for (const mode of ['absent', 'no-trustline', 'trusted'] as const) {
    const recipient = Keypair.random(), ephemeral = Keypair.random(), unused = Keypair.random()
    if (mode !== 'absent') accounts.set(recipient.publicKey(), { sequence: '100', usdc: '0', trusts: mode === 'trusted', native: '0', sponsored: mode === 'trusted' ? 3 : 2 })
    const campaign = await prisma.campaign.create({ data: { userId: user.id, organizationId, name: `App lifecycle ${mode}`, network: 'testnet', fundingMode: 'SPONSORED',
      sponsorPublicKey: sponsor.publicKey(), senderPublicKey: sender.publicKey(), assetCode: 'USDC', assetIssuer: issuer,
      amountPerLink: '1', linkCount: 2, expiresAt: new Date(Date.now() + 3600000), csvExportedAt: new Date() } })
    await prisma.claimLink.createMany({ data: [ephemeral, unused].map((key) => ({ campaignId: campaign.id, ephemeralPublicKey: key.publicKey(), amount: '1' })) })
    const start = new Decimal(accounts.get(sender.publicKey())!.usdc)
    const funding = await prepareBatch(campaign.id, organizationId, {})
    assert.equal(funding.kind, 'ok'); if (funding.kind !== 'ok') throw new Error('prepare funding')
    const funded = await submitBatch(campaign.id, organizationId, { sequence: funding.value.sequence, signedXdr: signed(funding.value.xdr, sender) })
    assert.equal(funded.kind, 'ok')
    const batch = await prisma.batch.findFirstOrThrow({ where: { campaignId: campaign.id } })
    assert.equal(await confirmOne(batch.id), 'confirmed')
    check(`${mode}: app funding takes exactly 2 sender USDC`, start.minus(accounts.get(sender.publicKey())!.usdc).equals(2))
    check(`${mode}: funding preserves sender zero XLM`, accounts.get(sender.publicKey())!.native === '0')
    const materialise = await prepareMaterialise(ephemeral.publicKey())
    assert.equal(materialise.kind, 'ok'); if (materialise.kind !== 'ok' || !materialise.value.xdr) throw new Error('prepare materialise')
    if (mode === 'trusted') {
      const before = submissions
      await prisma.campaign.update({ where: { id: campaign.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
      check('a prepared materialise is refused after campaign expiry', (await submitClaim(ephemeral.publicKey(), signed(materialise.value.xdr, ephemeral), 'materialise')).kind === 'conflict')
      await prisma.campaign.update({ where: { id: campaign.id }, data: { expiresAt: campaign.expiresAt } })
      await prisma.claimLink.update({ where: { ephemeralPublicKey: ephemeral.publicKey() }, data: { suspendedAt: new Date() } })
      check('a prepared materialise is refused after suspension', (await submitClaim(ephemeral.publicKey(), signed(materialise.value.xdr, ephemeral), 'materialise')).kind === 'not-found')
      await prisma.claimLink.update({ where: { ephemeralPublicKey: ephemeral.publicKey() }, data: { suspendedAt: null } })
      check('expiry and suspension refusals never submit', submissions === before)
    }
    const tx1 = await submitClaim(ephemeral.publicKey(), signed(materialise.value.xdr, ephemeral), 'materialise')
    assert.equal(tx1.kind, 'ok')
    check(`${mode}: claim waits for a strictly later ledger`, (await prepareClaim(ephemeral.publicKey(), recipient.publicKey())).kind === 'conflict')
    ledger++
    const claim = await prepareClaim(ephemeral.publicKey(), recipient.publicKey())
    assert.equal(claim.kind, 'ok'); if (claim.kind !== 'ok') throw new Error('prepare claim')
    check(`${mode}: recipient signature is conditional`, claim.value.needsRecipientSignature === (mode !== 'trusted'))
    check(`${mode}: ledger bound prevents TX2 in the creation ledger`, parseAttempt(claim.value.xdr).ledgerBounds?.minLedger === ledger)
    const repeat = await prepareClaim(ephemeral.publicKey(), recipient.publicKey())
    check(`${mode}: two prepares reuse the identical body`, repeat.kind === 'ok' && repeat.value.xdr === claim.value.xdr)
    const beforeInvalid = submissions
    check(`${mode}: unsigned claim refused before Horizon`, (await submitClaim(ephemeral.publicKey(), claim.value.xdr, 'claim')).kind === 'conflict')
    const wrongNetwork = TransactionBuilder.fromXDR(claim.value.xdr, Networks.PUBLIC) as Transaction
    wrongNetwork.sign(ephemeral)
    check(`${mode}: wrong-network signature refused`, (await submitClaim(ephemeral.publicKey(), wrongNetwork.toXDR(), 'claim')).kind === 'conflict')
    const modified = TransactionBuilder.cloneFrom(parseAttempt(claim.value.xdr), { fee: '99999' }).build()
    modified.sign(ephemeral, sponsor)
    check(`${mode}: changed prepared body refused`, (await submitClaim(ephemeral.publicKey(), modified.toXDR(), 'claim')).kind === 'conflict')
    check(`${mode}: invalid bodies never reach Horizon`, submissions === beforeInvalid)
    let claimXdr = signed(claim.value.xdr, ephemeral)
    if (claim.value.needsRecipientSignature) claimXdr = signed(claimXdr, recipient)
    if (mode === 'trusted') {
      rejectNext = true
      check('definite rejection is not mistaken for a pending success', (await submitClaim(ephemeral.publicKey(), claimXdr, 'claim')).kind === 'conflict')
      check('rejected claim preserves the balance and temporary account', balances.size === 2 && accounts.has(ephemeral.publicKey()))
      const again = await prepareClaim(ephemeral.publicKey(), recipient.publicKey())
      assert(again.kind === 'ok')
      claimXdr = signed(again.value.xdr, ephemeral)
      check('a new prepare is possible after a definite rejection', true)
    }
    loseResponse = true; hideRecords = true
    const lostClaim = await submitClaim(ephemeral.publicKey(), claimXdr, 'claim')
    check(`${mode}: lost claim response is pending`, lostClaim.kind === 'unavailable')
    const link = await prisma.claimLink.findUniqueOrThrow({ where: { ephemeralPublicKey: ephemeral.publicKey() } })
    check(`${mode}: original signed claim saved before network`, (await prisma.ledgerAttempt.findUniqueOrThrow({ where: { scope: `claim:${link.id}` } })).submittedXdr === claimXdr)
    const afterClaim = submissions
    if (mode === 'trusted') {
      await prisma.campaign.update({ where: { id: campaign.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
      await prisma.claimLink.update({ where: { id: link.id }, data: { suspendedAt: new Date() } })
      check('an uncertain claim remains pending during suspension', (await submitClaim(ephemeral.publicKey(), claimXdr, 'claim')).kind === 'unavailable')
      check('suspended or expired recovery never resubmits', submissions === afterClaim)
    }
    hideRecords = false
    if (mode === 'trusted') {
      await (await import('../src/workers/ledger-attempts')).recoverLedgerAttempts(campaign.id)
      check('worker recovers a lost claim without browser keys', (await prisma.claimLink.findUniqueOrThrow({ where: { id: link.id } })).status === 'CLAIMED')
      check('a confirmed earlier claim can be recorded after suspension and expiry', (await prisma.ledgerAttempt.findUniqueOrThrow({ where: { scope: `claim:${link.id}` } })).status === 'SETTLED')
    }
    const claimRecovered = await submitClaim(ephemeral.publicKey(), claimXdr, 'claim')
    check(`${mode}: exact claim retry recovers receipt`, claimRecovered.kind === 'ok')
    check(`${mode}: recovery does not submit twice`, submissions === afterClaim)
    check(`${mode}: recipient gets exactly 1 USDC and zero XLM`, new Decimal(accounts.get(recipient.publicKey())!.usdc).equals(1) && accounts.get(recipient.publicKey())!.native === '0')
    check(`${mode}: temporary account and claimed balance removed`, !accounts.has(ephemeral.publicKey()) && balances.size === 1)
    check(`${mode}: required persistent recipient reserves remain`, accounts.get(recipient.publicKey())!.sponsored === 3)
    check(`${mode}: DB records the actual recipient/hash`, (await prisma.claimLink.findUniqueOrThrow({ where: { id: link.id } })).claimedBy === recipient.publicKey())
    await prisma.campaign.update({ where: { id: campaign.id }, data: { expiresAt: new Date(Date.now() - 1000), status: 'EXPIRED' } })
    const reclaimDeps = {
      readBalances: async () => new Map([...balances].map(([id, balance]) => [id, balance.amount])),
      loadAccount: async (key: string) => { const account = accounts.get(key); return account ? new (await import('@stellar/stellar-sdk')).Account(key, account.sequence) : null },
      submit: async (transaction: Transaction) => { const { horizon } = await import('../src/lib/stellar/horizon'); const result = await horizon().submitTransaction(transaction); return { feeCharged: (await import('../src/lib/stellar/fees')).feeChargedOf(result.result_xdr) } },
      lookup: (await import('../src/lib/stellar/attempts')).lookupAttempt,
    }
    const reclaim = await prepareReclaim(campaign.id, organizationId, reclaimDeps)
    assert.equal(reclaim.kind, 'ok'); if (reclaim.kind !== 'ok') throw new Error('prepare reclaim')
    check(`${mode}: reclaim sponsor pays while sender owns the refund`, parseAttempt(reclaim.value.xdr).source === sponsor.publicKey() && parseAttempt(reclaim.value.xdr).operations.every((operation) => operation.source === sender.publicKey()))
    const refund = signed(reclaim.value.xdr, sender)
    loseResponse = true; hideRecords = true
    check(`${mode}: lost reclaim response is pending`, (await submitReclaim(campaign.id, organizationId, { signedXdr: refund }, reclaimDeps)).kind === 'conflict')
    const afterRefund = submissions
    hideRecords = false
    if (mode === 'trusted') {
      await (await import('../src/workers/ledger-attempts')).recoverLedgerAttempts(campaign.id)
      check('worker recovers a lost refund without sender keys', await prisma.reclaimBatch.count({ where: { campaignId: campaign.id } }) === 1)
    }
    const recovered = await submitReclaim(campaign.id, organizationId, { signedXdr: refund }, reclaimDeps)
    check(`${mode}: refund retry succeeds after balance disappeared`, recovered.kind === 'ok' && recovered.value.amount === '1')
    check(`${mode}: refund recovery never pays twice`, submissions === afterRefund)
    check(`${mode}: one USDC net sent; sender still zero XLM`, start.minus(accounts.get(sender.publicKey())!.usdc).equals(1) && accounts.get(sender.publicKey())!.native === '0')
    check(`${mode}: exactly one settled refund record`, await prisma.reclaimBatch.count({ where: { campaignId: campaign.id } }) === 1)
    check(`${mode}: claimed and reclaimed links accounted separately`, await prisma.claimLink.count({ where: { campaignId: campaign.id, status: 'CLAIMED' } }) === 1 && await prisma.claimLink.count({ where: { campaignId: campaign.id, status: 'RECLAIMED' } }) === 1)
    check(`${mode}: no claimable balances remain`, balances.size === 0)
    check(`${mode}: refund replay remains idempotent`, (await submitReclaim(campaign.id, organizationId, { signedXdr: refund }, reclaimDeps)).kind === 'ok' && submissions === afterRefund)
    if (mode === 'trusted') {
      const { executeAttempt, lookupAttempt, prepareAttempt } = await import('../src/lib/stellar/attempts')
      const expired = new TransactionBuilder(new Account(sponsor.publicKey(), accounts.get(sponsor.publicKey())!.sequence), {
        fee: '1000', networkPassphrase: Networks.TESTNET,
      }).addOperation(Operation.bumpSequence({ bumpTo: '999999' })).setTimebounds(0, Math.floor(Date.now() / 1000) - 30).build()
      expired.sign(sponsor)
      const attempt = await prepareAttempt(`fixture-expired:${campaign.id}`, campaign.id, 'CLAIM', expired.toXDR(), {})
      const result = await executeAttempt(attempt, expired, async () => { throw new Error('An expired body must not be submitted') }, lookupAttempt)
      check('expired uncertain attempt is retired only after the closed-ledger bound and hash checks', !result.successful &&
        (await prisma.ledgerAttempt.findUniqueOrThrow({ where: { scope: attempt.scope } })).status === 'FAILED')
      check('expired attempt never reaches network submission', submissions === afterRefund)
    }
    ledger++
  }
  console.log(`${checks} app lifecycle checks passed (simulated Horizon; no chain writes).`)
} finally {
  const batches = await prisma.batch.findMany({ where: { campaign: { userId: user.id } } })
  const queue = batchConfirmQueue()
  for (const job of await queue.getJobs(['waiting', 'delayed', 'failed', 'completed'])) {
    if (batches.some((batch) => job.data.batchId === batch.id)) await job.remove()
  }
  await queue.close()
  await prisma.campaign.deleteMany({ where: { userId: user.id } })
  // Audit actors remain because the append-only audit chain references them.
  await prisma.$disconnect()
  redis.disconnect()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}
