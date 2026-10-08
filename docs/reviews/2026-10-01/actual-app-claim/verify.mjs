// Public, read-only proof for the user's actual reissue claim and all outstanding funds.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import Decimal from 'decimal.js'
import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
const origin = 'https://horizon-testnet.stellar.org'
const sender = 'GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A'
const recipient = 'GCUFES42LLEWVEAI6TZDQUO63ROTR2ILUMNP4K7XCTHFT5F6NKSXGH3I'
const sponsor = 'GA6ALOBUNXQVFCDGXXMUAL7DJY4CUY7BUNGAPWXTJ633PYNEKZNUJ6J5'
const ephemeral = 'GD3GXDCTNKK755CJMJ73DBVAD3HMH7SO7M4F2L4TYEV5ZFVLPJPT7J4S'
const issuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
const claimHash = 'aa495e65ac2d88c3d20c0433b20924364fc1414ae0ba831bd584e01e66a93bce'
const tx1Hash = '18c9dbd642d01c3d338683c464392247ed9efb4bd9efd99eb657e0322b8dda1a'
const fundHash = '51f03667ca967988ae514af5f85cd5bf82cfd82f72be9db6535298c299519e3d'
const claimedId = '0000000072dd7421f9583b0ba249579c102fccbed00ef46649249b15b7464175f7a56107'
const oldIds = ['0000000053a8bc618dc0ba7a5ec6b6af7836f011a7d1afa5c843167732898c766faa7fdc',
  '00000000c9459cdc01a80320e6461e02755851fdfbcd71ae0786b7dc6485d6319eed0de6']
const unusedId = '0000000063b1a5d9131f75e31f466ba5bae617761e0683bf0afe8a200b5026de8b43a7d1'
async function read(path) {
  const response = await fetch(origin + path)
  assert.equal(response.status, 200, `Ledger read failed: ${path}`)
  return response.json()
}
assert.equal((await read('')).network_passphrase, Networks.TESTNET)
const [fund, tx1, claim, effects, senderAccount, recipientAccount, sponsorAccount, ...balances] = await Promise.all([
  read('/transactions/' + fundHash), read('/transactions/' + tx1Hash), read('/transactions/' + claimHash),
  read('/transactions/' + claimHash + '/effects?limit=100'),
  ...[sender, recipient, sponsor].map((key) => read('/accounts/' + key)),
  ...[...oldIds, unusedId].map((id) => read('/claimable_balances/' + id)),
])
const decode = (record) => {
  const transaction = TransactionBuilder.fromXDR(record.envelope_xdr, Networks.TESTNET)
  assert.ok(transaction instanceof Transaction)
  assert.equal(transaction.hash().toString('hex'), record.hash)
  assert.equal(record.successful, true)
  assert.equal(record.fee_account, sponsor)
  return transaction
}
const funding = decode(fund)
const materialise = decode(tx1)
const transaction = decode(claim)
assert.equal(claim.hash, claimHash)
assert.equal(transaction.source, sponsor)
assert.equal(claim.fee_charged, '400')
assert.equal(tx1.fee_charged, '600')
assert.ok(claim.ledger > tx1.ledger)
for (const envelope of [materialise, transaction]) {
  assert.equal(envelope.signatures.length, 2)
  for (const key of [ephemeral, sponsor]) assert.ok(envelope.signatures.some((signature) => Keypair.fromPublicKey(key).verify(envelope.hash(), signature.signature())))
}
assert.deepEqual(transaction.operations.map((operation) => operation.type), ['claimClaimableBalance', 'payment', 'changeTrust', 'accountMerge'])
const [claimOperation, payment, removeTrust, merge] = transaction.operations
assert.equal(claimOperation.balanceId, claimedId)
assert.ok(transaction.operations.every((operation) => operation.source === ephemeral))
assert.equal(payment.destination, recipient)
assert.equal(payment.amount, '1.0000000')
assert.equal(payment.asset.getCode(), 'USDC')
assert.equal(payment.asset.getIssuer(), issuer)
assert.equal(removeTrust.limit, '0.0000000')
assert.equal(removeTrust.line.getIssuer(), issuer)
assert.equal(removeTrust.line.getCode(), 'USDC')
assert.equal(merge.destination, recipient)
const creation = materialise.operations.find((operation) => operation.type === 'createAccount')
assert.equal(creation.destination, ephemeral)
assert.equal(creation.startingBalance, '0.0000000')
assert.equal((await fetch(origin + '/accounts/' + ephemeral)).status, 404)
assert.equal((await fetch(origin + '/claimable_balances/' + claimedId)).status, 404)
const received = effects._embedded.records.filter((entry) => entry.type === 'account_credited' && entry.account === recipient && entry.asset_code === 'USDC' && entry.asset_issuer === issuer)
assert.equal(received.reduce((total, entry) => total.plus(entry.amount), new Decimal(0)).toFixed(7), '1.0000000')
const native = (account) => account.balances.find((entry) => entry.asset_type === 'native').balance
const usdc = (account) => account.balances.find((entry) => entry.asset_code === 'USDC' && entry.asset_issuer === issuer)?.balance ?? '0.0000000'
assert.equal(native(senderAccount), '0.0000000')
assert.equal(usdc(senderAccount), '13.0000000')
assert.equal(native(recipientAccount), '0.0000000')
assert.equal(usdc(recipientAccount), '2.0000000')
assert.equal(recipientAccount.num_sponsored, 3)
assert.equal(sponsorAccount.num_sponsoring, 6)
for (const balance of balances) {
  assert.equal(balance.asset, 'USDC:' + issuer)
  assert.equal(balance.amount, '1.0000000')
  assert.equal(balance.sponsor, sponsor)
  assert.equal(balance.claimants[1].destination, sender)
}
assert.equal(balances[0].claimants[1].predicate.not.abs_before, '2026-10-01T10:07:00Z')
assert.equal(balances[1].claimants[1].predicate.not.abs_before, '2026-10-01T10:07:00Z')
assert.equal(balances[2].claimants[1].predicate.not.abs_before, '2026-10-31T02:02:00Z')
assert.ok(funding.operations.some((operation, index) => operation.type === 'createClaimableBalance' && funding.getClaimableBalanceId(index) === claimedId))
assert.ok(new Decimal(usdc(senderAccount)).plus(usdc(recipientAccount)).plus(3).equals(18))
const proof = { checkedAt: new Date().toISOString(), network: 'testnet', readOnly: true,
  campaignId: 'cmupd9xde0008y8kjuywfibzl', fundingHash: fundHash, tx1Hash, claimHash,
  materialiseLedger: tx1.ledger, claimLedger: claim.ledger, successful: true,
  recipientReceived: '1.0000000', sender: { usdc: usdc(senderAccount), xlm: native(senderAccount) },
  recipient: { usdc: usdc(recipientAccount), xlm: native(recipientAccount) },
  feePaidBySponsorStroops: { materialise: tx1.fee_charged, claim: claim.fee_charged },
  signaturesVerified: true, temporaryAccountRemoved: true, claimedBalanceRemoved: true,
  senderRecipientAndOutstandingUsdc: '18.0000000', remainingSponsorReserveUnits: 6,
  outstanding: [{ campaignId: 'cmupcw5ey0004y8kjq7oryzzk', amount: '2.0000000',
    expiresAt: '2026-10-01T10:07:00Z', balanceIds: oldIds },
  { campaignId: 'cmupd9xde0008y8kjuywfibzl', amount: '1.0000000', expiresAt: '2026-10-31T02:02:00Z', balanceIds: [unusedId] }],
  acceptancePassed: true }
fs.writeFileSync('docs/reviews/2026-10-01/actual-app-claim/claim.json', JSON.stringify(proof, null, 2) + '\n')
fs.writeFileSync('docs/reviews/2026-10-01/actual-app-claim/transactions.json', JSON.stringify({ fund, tx1, claim }, null, 2) + '\n')
console.log(JSON.stringify(proof))
