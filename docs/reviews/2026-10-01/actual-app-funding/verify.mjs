// Independent, read-only Testnet funding proof. Public identifiers/envelopes only.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import Decimal from 'decimal.js'
import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
const origin = 'https://horizon-testnet.stellar.org'
const hash = '36edf24fbfb993423690fe9709e6d19d06b17e67d16cf3337c09c627d71aa0ae'
const sender = 'GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A'
const sponsor = 'GA6ALOBUNXQVFCDGXXMUAL7DJY4CUY7BUNGAPWXTJ633PYNEKZNUJ6J5'
const recipient = 'GCUFES42LLEWVEAI6TZDQUO63ROTR2ILUMNP4K7XCTHFT5F6NKSXGH3I'
const issuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
const ids = ['00000000c9459cdc01a80320e6461e02755851fdfbcd71ae0786b7dc6485d6319eed0de6',
  '0000000053a8bc618dc0ba7a5ec6b6af7836f011a7d1afa5c843167732898c766faa7fdc']
const claimants = ['GALNCRAUPULK34TANNX6BR4T5V3BUKQGNMHXMYJBYG7V6O3EHQPP2ERW',
  'GBG2DAFJDATYB67YNMMB6NZ7HPDNCWTYK4BRJAL2FG5BRDEHO6TY4VD6']
async function read(path) {
  const response = await fetch(`${origin}${path}`)
  assert.equal(response.status, 200, `Ledger read failed: ${path}`)
  return response.json()
}
assert.equal((await read('')).network_passphrase, Networks.TESTNET)
const [record, effectPage, ...accounts] = await Promise.all([
  read(`/transactions/${hash}`), read(`/transactions/${hash}/effects?limit=100`),
  ...[sender, sponsor, recipient].map((address) => read(`/accounts/${address}`)),
])
const transaction = TransactionBuilder.fromXDR(record.envelope_xdr, Networks.TESTNET)
assert.ok(transaction instanceof Transaction)
assert.equal(transaction.hash().toString('hex'), hash)
assert.equal(record.successful, true)
assert.equal(record.source_account, sponsor)
assert.equal(record.fee_account, sponsor)
assert.equal(record.fee_charged, '400')
assert.deepEqual(transaction.operations.map((op) => op.type), ['beginSponsoringFutureReserves',
  'createClaimableBalance', 'createClaimableBalance', 'endSponsoringFutureReserves'])
for (const signer of [sender, sponsor]) {
  assert.ok(transaction.signatures.some((signature) => Keypair.fromPublicKey(signer).verify(transaction.hash(), signature.signature())))
}
assert.equal(transaction.operations[0].sponsoredId, sender)
assert.equal(transaction.operations[3].source, sender)
const balances = await Promise.all(ids.map((id) => read(`/claimable_balances/${id}`)))
for (let i = 0; i < balances.length; i++) {
  const balance = balances[i]
  // Database display order is not transaction operation order. Bind each
  // recorded balance ID to its actual operation before checking its owner.
  const operationIndex = [1, 2].find((index) => transaction.getClaimableBalanceId(index) === ids[i])
  assert.ok(operationIndex)
  assert.equal(balance.asset, `USDC:${issuer}`)
  assert.equal(balance.amount, '1.0000000')
  assert.equal(balance.sponsor, sponsor)
  assert.equal(transaction.operations[operationIndex].source, sender)
  assert.deepEqual(balance.claimants.map((entry) => entry.destination), [claimants[i], sender])
  assert.equal(balance.claimants[0].predicate.abs_before, '2026-10-01T10:07:00Z')
  assert.equal(balance.claimants[1].predicate.not.abs_before, '2026-10-01T10:07:00Z')
}
const effects = effectPage._embedded.records
const debit = effects.filter((entry) => entry.type === 'account_debited' && entry.account === sender && entry.asset_code === 'USDC' && entry.asset_issuer === issuer)
assert.equal(debit.reduce((total, entry) => total.plus(entry.amount), new Decimal(0)).toFixed(7), '2.0000000')
const native = (account) => account.balances.find((entry) => entry.asset_type === 'native').balance
const usdc = (account) => account.balances.find((entry) => entry.asset_code === 'USDC' && entry.asset_issuer === issuer)?.balance ?? '0.0000000'
assert.equal(native(accounts[0]), '0.0000000')
assert.equal(usdc(accounts[0]), '15.0000000')
assert.equal(native(accounts[2]), '0.0000000')
assert.equal(usdc(accounts[2]), '1.0000000')
assert.equal(accounts[1].num_sponsoring, 4)
const proof = { checkedAt: new Date().toISOString(), network: 'testnet', readOnly: true,
  campaignId: 'cmupcw5ey0004y8kjq7oryzzk', hash, ledger: record.ledger, successful: true,
  feePayer: sponsor, feeChargedStroops: record.fee_charged, senderUsdcDebit: '2.0000000',
  sender: { usdc: usdc(accounts[0]), xlm: native(accounts[0]) },
  recipient: { usdc: usdc(accounts[2]), xlm: native(accounts[2]) },
  claimableBalances: balances, sponsorReserveUnits: accounts[1].num_sponsoring,
  bothRequiredSignaturesVerified: true, expiry: '2026-10-01T10:07:00Z', acceptancePassed: true }
fs.writeFileSync('docs/reviews/2026-10-01/actual-app-funding/funding.json', JSON.stringify(proof, null, 2) + '\n')
fs.writeFileSync('docs/reviews/2026-10-01/actual-app-funding/transaction.json', JSON.stringify(record, null, 2) + '\n')
console.log(JSON.stringify({ ...proof, claimableBalances: ids }))
