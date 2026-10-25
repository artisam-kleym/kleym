/** Opt-in disposable Testnet qualification of the production funding/reclaim builders.
 * No operator wallet, official USDC, database, bearer export or Mainnet submission.
 * Keys stay in this process; the output contains public ledger evidence only.
 */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { Account, Asset, Horizon, Keypair, Networks, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { buildBatchTransaction, planBatches, verifyBatchTransaction } from '../src/lib/stellar/batch'
import { buildReclaimTransaction, verifyReclaimTransaction } from '../src/lib/stellar/reclaim'
import { computeCost } from '../src/lib/campaign/cost'
import { assertLiveTestnet, TESTNET_HORIZON, TESTNET_FRIENDBOT, testnetProtocolSettings } from './lib/testnet-protocol-gate'

async function main() {
  if (process.env.LIVE_TESTNET_PROTOCOL !== '1') throw new Error('Set LIVE_TESTNET_PROTOCOL=1 for disposable Testnet verification')
  testnetProtocolSettings(process.env.HORIZON_URL ?? TESTNET_HORIZON, process.env.FRIENDBOT_URL ?? TESTNET_FRIENDBOT, process.env.NETWORK_PASSPHRASE)
  await assertLiveTestnet()
  const server = new Horizon.Server(TESTNET_HORIZON)
  const issuer = Keypair.random(), sponsor = Keypair.random(), sender = Keypair.random()
  const asset = new Asset('USDC', issuer.publicKey())
  const links = Array.from({ length: 200 }, (_, index) => ({ id: `probe-${index + 1}`, ephemeralPublicKey: Keypair.random().publicKey(), amount: ['20', '15', '10'][index] ?? '5' }))
  const total = links.reduce((sum, link) => sum.plus(link.amount), new Decimal(0)).toFixed(7)
  const transactions: { stage: string; hash: string; ledger: number; feeChargedStroops: string; operationCount: number }[] = []
  let fees = new Decimal(0)
  const parse = (xdr: string) => TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction
  const submit = async (stage: string, tx: Transaction) => {
    const result = await server.submitTransaction(tx)
    assert(result.successful)
    const ledger = await (await fetch(`${TESTNET_HORIZON}/transactions/${result.hash}`)).json() as { ledger: number; fee_charged: string }
    fees = fees.plus(ledger.fee_charged)
    transactions.push({ stage, hash: result.hash, ledger: result.ledger, feeChargedStroops: String(ledger.fee_charged), operationCount: tx.operations.length })
    return result
  }
  for (const key of [issuer, sponsor]) {
    const response = await fetch(`${TESTNET_FRIENDBOT}/?addr=${key.publicKey()}`, { signal: AbortSignal.timeout(30_000) })
    assert(response.ok, `Friendbot ${response.status}`)
  }
  const baseline = await server.loadAccount(sponsor.publicKey())
  const native = (account: Horizon.AccountResponse) => account.balances.find(b => b.asset_type === 'native')!.balance
  const usdc = (account: Horizon.AccountResponse) => account.balances.find(b => b.asset_type !== 'native' && 'asset_issuer' in b && b.asset_issuer === issuer.publicKey())?.balance ?? '0.0000000'
  const setup = new TransactionBuilder(baseline, { fee: '1000', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: sender.publicKey() }))
    .addOperation(Operation.createAccount({ destination: sender.publicKey(), startingBalance: '0' }))
    .addOperation(Operation.changeTrust({ source: sender.publicKey(), asset, limit: total }))
    .addOperation(Operation.endSponsoringFutureReserves({ source: sender.publicKey() }))
    .addOperation(Operation.payment({ source: issuer.publicKey(), destination: sender.publicKey(), asset, amount: total }))
    .setTimeout(120).build()
  setup.sign(sponsor, sender, issuer)
  await submit('setup', setup)
  const before = await server.loadAccount(sender.publicKey())
  assert.equal(native(before), '0.0000000'); assert.equal(before.num_sponsored, 3)
  const expiresAt = new Date(Date.now() + 120_000)
  const plans = planBatches(links, 88)
  const quote = computeCost({ linkCount: 200, amountPerLink: '5', amounts: links.map(l => l.amount), maxOpsPerBatch: 90, baseFeeStroops: '1000', reservePerLink: new Decimal((await server.ledgers().order('desc').limit(1).call()).records[0]!.base_reserve_in_stroops).times(2).div(1e7).toFixed(), sponsored: true })
  assert.equal(quote.signatures, plans.length)
  const balances: { linkId: string; balanceId: string }[] = []
  for (const plan of plans) {
    const expected = { senderPublicKey: sender.publicKey(), sponsorPublicKey: sponsor.publicKey(), asset, amountPerLink: '5', expiresAt, links: plan.links, networkPassphrase: Networks.TESTNET, baseFee: '1000' }
    const built = buildBatchTransaction({ ...expected, senderAccount: new Account(sender.publicKey(), (await server.loadAccount(sender.publicKey())).sequence), sponsorAccount: new Account(sponsor.publicKey(), (await server.loadAccount(sponsor.publicKey())).sequence), timeoutSeconds: 120 })
    const tx = parse(built.xdr); tx.sign(sender)
    assert(verifyBatchTransaction(tx.toXDR(), { ...expected, preparedHash: tx.hash().toString('hex') }).ok)
    tx.sign(sponsor)
    const result = await submit('fund', tx)
    // Replaying the identical confirmed envelope returns its original result.
    assert.equal((await server.submitTransaction(tx)).hash, result.hash)
    balances.push(...built.balanceIds)
  }
  assert.deepEqual(transactions.filter(t => t.stage === 'fund').map(t => t.operationCount), [90, 90, 26])
  const funded = await server.loadAccount(sender.publicKey())
  assert.equal(native(funded), '0.0000000'); assert.equal(usdc(funded), '0.0000000')
  assert.equal((await server.loadAccount(sponsor.publicKey())).num_sponsoring, 403)
  // The network, rather than a client clock, refuses early reclaim.
  const early = parse(buildReclaimTransaction({ senderAccount: new Account(sender.publicKey(), funded.sequence), sponsorAccount: new Account(sponsor.publicKey(), (await server.loadAccount(sponsor.publicKey())).sequence), senderPublicKey: sender.publicKey(), balanceIds: [balances[0]!.balanceId], networkPassphrase: Networks.TESTNET, baseFee: '1000', timeoutSeconds: 60 }).xdr)
  early.sign(sender, sponsor)
  try { await server.submitTransaction(early); assert.fail('Early reclaim unexpectedly succeeded') }
  catch (error) {
    const result = (error as { response?: { data?: { extras?: { result_codes?: { operations?: string[] } } } } }).response?.data?.extras?.result_codes
    assert(result?.operations?.includes('op_cannot_claim'), 'Expected ledger predicate refusal')
    const ledger = await (await fetch(`${TESTNET_HORIZON}/transactions/${early.hash().toString('hex')}`)).json() as { successful: boolean; hash: string; ledger: number; fee_charged: string }
    assert.equal(ledger.successful, false)
    fees = fees.plus(ledger.fee_charged)
    transactions.push({ stage: 'early-reclaim-refused', hash: ledger.hash, ledger: ledger.ledger, feeChargedStroops: String(ledger.fee_charged), operationCount: 1 })
  }
  for (let offset = 0; offset < balances.length; offset += 8) {
    await Promise.all(balances.slice(offset, offset + 8).map(async (mapped, index) => {
      const link = links[offset + index]!
      const balance = await server.claimableBalances().claimableBalance(mapped.balanceId).call()
      assert.equal(mapped.linkId, link.id); assert.equal(balance.asset, asset.toString()); assert.equal(balance.amount, new Decimal(link.amount).toFixed(7)); assert.equal(balance.sponsor, sponsor.publicKey())
      assert.equal(balance.claimants[0]!.destination, link.ephemeralPublicKey)
      assert.equal(balance.claimants[1]!.destination, sender.publicKey())
      assert.equal((balance.claimants[0]!.predicate as { abs_before: string }).abs_before, expiresAt.toISOString().replace(/\.\d{3}Z$/, 'Z'))
    }))
  }
  // Wait on ledger close time, not an assumed sleep duration.
  while (true) {
    const latest = (await server.ledgers().order('desc').limit(1).call()).records[0]!
    if (Date.parse(latest.closed_at) >= Math.floor(expiresAt.getTime() / 1000) * 1000) break
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  for (let offset = 0; offset < balances.length; offset += 90) {
    const balanceIds = balances.slice(offset, offset + 90).map(b => b.balanceId)
    const expected = { senderPublicKey: sender.publicKey(), sponsorPublicKey: sponsor.publicKey(), balanceIds, networkPassphrase: Networks.TESTNET, baseFee: '1000' }
    const tx = parse(buildReclaimTransaction({ ...expected, senderAccount: new Account(sender.publicKey(), (await server.loadAccount(sender.publicKey())).sequence), sponsorAccount: new Account(sponsor.publicKey(), (await server.loadAccount(sponsor.publicKey())).sequence), timeoutSeconds: 120 }).xdr)
    tx.sign(sender)
    assert(verifyReclaimTransaction(tx.toXDR(), { ...expected, preparedHash: tx.hash().toString('hex') }).ok)
    tx.sign(sponsor)
    const result = await submit('reclaim', tx)
    assert.equal((await server.submitTransaction(tx)).hash, result.hash)
  }
  const after = await server.loadAccount(sender.publicKey()), sponsorAfter = await server.loadAccount(sponsor.publicKey())
  assert.equal(native(after), '0.0000000'); assert.equal(usdc(after), total)
  assert.equal(sponsorAfter.num_sponsoring, 3)
  assert(new Decimal(native(baseline)).minus(native(sponsorAfter)).equals(fees.div(1e7)))
  const output = { status: 'PASS', checkedAt: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? null, network: 'testnet', asset: asset.toString(), assetQualification: 'disposable custom issuer; not official USDC', wallet: 'disposable Node signers; not wallet UI acceptance', sender: sender.publicKey(), sponsor: sponsor.publicKey(), total, linkCount: 200, quote, transactions, balances: balances.map((b, index) => ({ ...b, ...links[index] })), senderBefore: { native: native(before), usdc: usdc(before) }, senderAfter: { native: native(after), usdc: usdc(after) }, sponsorReserveUnitsBefore: 3, sponsorReserveUnitsFunded: 403, sponsorReserveUnitsAfter: sponsorAfter.num_sponsoring, assertions: { exactMappingAll200: true, variableAmounts: true, earlyReclaimRefusedByLedger: true, duplicateFundingAndReclaimIdempotent: true, zeroNativeSender: true, feeOnlySponsorDebit: true, reserveUnitsReleased: 400 } }
  if (process.env.TESTNET_RESULT_FILE) writeFileSync(process.env.TESTNET_RESULT_FILE, JSON.stringify(output, null, 2) + '\n')
  console.log(JSON.stringify({ status: output.status, linkCount: output.linkCount, transactions: output.transactions, total: output.total }))
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Large sponsored Testnet verification failed'); process.exitCode = 1 })
