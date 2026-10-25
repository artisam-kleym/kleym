/** Disposable Testnet proof: nonzero native balance, but no spendable XLM.
 * Bootstrap XLM comes explicitly from a disposable issuer, not a user wallet.
 * Funding/reclaim use the production builders and a separate fee/reserve sponsor.
 */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { Account, Asset, Horizon, Keypair, Networks, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { buildBatchTransaction } from '../src/lib/stellar/batch'
import { buildReclaimTransaction } from '../src/lib/stellar/reclaim'
import { assertLiveTestnet, TESTNET_HORIZON, TESTNET_FRIENDBOT, testnetProtocolSettings } from './lib/testnet-protocol-gate'

async function main() {
  if (process.env.LIVE_TESTNET_PROTOCOL !== '1') throw new Error('Set LIVE_TESTNET_PROTOCOL=1 for disposable Testnet verification')
  testnetProtocolSettings(process.env.HORIZON_URL ?? TESTNET_HORIZON, process.env.FRIENDBOT_URL ?? TESTNET_FRIENDBOT, process.env.NETWORK_PASSPHRASE)
  await assertLiveTestnet()
  const server = new Horizon.Server(TESTNET_HORIZON)
  const issuer = Keypair.random(), sponsor = Keypair.random(), sender = Keypair.random()
  for (const key of [issuer, sponsor]) assert((await fetch(`${TESTNET_FRIENDBOT}/?addr=${key.publicKey()}`, { signal: AbortSignal.timeout(30_000) })).ok)
  const ledger = (await server.ledgers().order('desc').limit(1).call()).records[0]!
  const minimum = new Decimal(ledger.base_reserve_in_stroops).times(3).div(1e7).toFixed(7)
  const asset = new Asset('USDC', issuer.publicKey())
  const transactions: { stage: string; hash: string; ledger: number; feeChargedStroops: string }[] = []
  let sponsorFees = new Decimal(0)
  const submit = async (stage: string, tx: Transaction) => {
    const result = await server.submitTransaction(tx)
    const confirmed = await (await fetch(`${TESTNET_HORIZON}/transactions/${result.hash}`)).json() as { ledger: number; successful: boolean; fee_charged: string }
    assert(confirmed.successful)
    if (tx.source === sponsor.publicKey()) sponsorFees = sponsorFees.plus(confirmed.fee_charged)
    transactions.push({ stage, hash: result.hash, ledger: confirmed.ledger, feeChargedStroops: confirmed.fee_charged })
  }
  const setup = new TransactionBuilder(await server.loadAccount(issuer.publicKey()), { fee: '1000', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.createAccount({ destination: sender.publicKey(), startingBalance: minimum }))
    .addOperation(Operation.changeTrust({ source: sender.publicKey(), asset, limit: '1' }))
    .addOperation(Operation.payment({ destination: sender.publicKey(), asset, amount: '1' }))
    .setTimeout(120).build()
  setup.sign(issuer, sender); await submit('explicit-reserve-only-bootstrap', setup)
  const snapshot = async (key: string) => {
    const account = await server.loadAccount(key)
    return { address: key, native: account.balances.find(b => b.asset_type === 'native')!.balance, usdc: account.balances.find(b => 'asset_issuer' in b && b.asset_issuer === issuer.publicKey())?.balance ?? '0.0000000', numSponsoring: account.num_sponsoring, numSponsored: account.num_sponsored }
  }
  const before = await snapshot(sender.publicKey()), sponsorBefore = await snapshot(sponsor.publicKey())
  assert.equal(before.native, minimum); assert.equal(before.numSponsored, 0); assert.equal(before.usdc, '1.0000000')
  const expiresAt = new Date(Date.now() + 30_000)
  const account = async (key: string) => new Account(key, (await server.loadAccount(key)).sequence)
  const built = buildBatchTransaction({ senderAccount: await account(sender.publicKey()), sponsorAccount: await account(sponsor.publicKey()), senderPublicKey: sender.publicKey(), links: [{ id: 'reserve-only', ephemeralPublicKey: Keypair.random().publicKey() }], asset, amountPerLink: '1', expiresAt, networkPassphrase: Networks.TESTNET, baseFee: '1000', timeoutSeconds: 120 })
  const fund = TransactionBuilder.fromXDR(built.xdr, Networks.TESTNET) as Transaction
  fund.sign(sender, sponsor); await submit('fund', fund)
  assert.equal((await snapshot(sender.publicKey())).usdc, '0.0000000')
  assert.equal((await snapshot(sponsor.publicKey())).numSponsoring, 2)
  while (Date.parse((await server.ledgers().order('desc').limit(1).call()).records[0]!.closed_at) < Math.floor(expiresAt.getTime() / 1000) * 1000) await new Promise(resolve => setTimeout(resolve, 5000))
  const reclaim = TransactionBuilder.fromXDR(buildReclaimTransaction({ senderAccount: await account(sender.publicKey()), sponsorAccount: await account(sponsor.publicKey()), senderPublicKey: sender.publicKey(), balanceIds: built.balanceIds.map(b => b.balanceId), networkPassphrase: Networks.TESTNET, baseFee: '1000', timeoutSeconds: 120 }).xdr, Networks.TESTNET) as Transaction
  reclaim.sign(sender, sponsor); await submit('reclaim', reclaim)
  const after = await snapshot(sender.publicKey()), sponsorAfter = await snapshot(sponsor.publicKey())
  assert.equal(after.native, minimum); assert.equal(after.usdc, '1.0000000'); assert.equal(sponsorAfter.numSponsoring, 0)
  assert(new Decimal(sponsorBefore.native).minus(sponsorAfter.native).equals(sponsorFees.div(1e7)))
  const evidence = { status: 'PASS', checkedAt: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? null, network: 'testnet', asset: asset.toString(), assetQualification: 'disposable custom issuer; not official USDC', wallet: 'disposable Node signers; not wallet UI acceptance', minimumReserve: minimum, spendableNativeBeforeAndAfter: '0.0000000', before, after, sponsorBefore, sponsorAfter, transactions, assertions: { senderNativeUnchanged: true, senderPrincipalReturnedExactly: true, sponsorFeeOnlyDebit: true, balanceReservesReleased: true } }
  if (process.env.TESTNET_RESULT_FILE) writeFileSync(process.env.TESTNET_RESULT_FILE, JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify(evidence))
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Reserve-only Testnet verification failed'); process.exitCode = 1 })
