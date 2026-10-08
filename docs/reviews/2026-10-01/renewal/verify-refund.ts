/** Independent read-only proof of the user's already submitted original refund. */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
const hash = '84874377481e48be0fdd11712f2adf949ea3af69f7a6425a4af3a369ac0cc141'
const sender = 'GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A'
const recipient = 'GCUFES42LLEWVEAI6TZDQUO63ROTR2ILUMNP4K7XCTHFT5F6NKSXGH3I'
const sponsor = 'GA6ALOBUNXQVFCDGXXMUAL7DJY4CUY7BUNGAPWXTJ633PYNEKZNUJ6J5'
const issuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
const ids = ['0000000053a8bc618dc0ba7a5ec6b6af7836f011a7d1afa5c843167732898c766faa7fdc', '00000000c9459cdc01a80320e6461e02755851fdfbcd71ae0786b7dc6485d6319eed0de6']
async function read(path: string) {
  const r = await fetch(`https://horizon-testnet.stellar.org${path}`, { signal: AbortSignal.timeout(15000) })
  assert(r.ok, `Read failed: ${r.status}`)
  return r.json()
}
const [record, operations, effects, account, target, hot] = await Promise.all([read(`/transactions/${hash}`), read(`/transactions/${hash}/operations`), read(`/transactions/${hash}/effects`), read(`/accounts/${sender}`), read(`/accounts/${recipient}`), read(`/accounts/${sponsor}`)])
assert.equal(record.successful, true)
const tx = TransactionBuilder.fromXDR(record.envelope_xdr, Networks.TESTNET)
assert(tx instanceof Transaction)
assert.equal(tx.hash().toString('hex'), hash)
assert.equal(tx.source, sponsor)
assert.equal(record.fee_charged, '200')
for (const address of [sender, sponsor]) {
  const key = Keypair.fromPublicKey(address)
  assert(tx.signatures.some((s) => s.hint().equals(key.signatureHint()) && key.verify(tx.hash(), s.signature())))
}
assert.equal(tx.operations.length, 2)
for (const op of tx.operations) {
  assert.equal(op.type, 'claimClaimableBalance')
  assert.equal(op.source, sender)
  assert(op.type === 'claimClaimableBalance' && ids.includes(op.balanceId))
}
assert.equal(new Set(tx.operations.map((op) => op.type === 'claimClaimableBalance' && op.balanceId)).size, 2)
for (const op of operations._embedded.records) {
  assert.equal(op.claimant, sender)
}
const claimed = effects._embedded.records.filter((effect: { type: string }) => effect.type === 'claimable_balance_claimed')
assert.equal(claimed.length, 2)
for (const effect of claimed) {
  assert.equal(effect.amount, '1.0000000')
  assert.equal(effect.asset, `USDC:${issuer}`)
  assert.equal(effect.account, sender)
  assert(ids.includes(effect.balance_id))
}
for (const id of ids) assert.equal((await fetch(`https://horizon-testnet.stellar.org/claimable_balances/${id}`)).status, 404)
const balance = (a: typeof account, code: string) => a.balances.find((b: { asset_type: string; asset_code?: string; asset_issuer?: string }) => code === 'XLM' ? b.asset_type === 'native' : b.asset_code === 'USDC' && b.asset_issuer === issuer).balance
assert.equal(balance(account, 'XLM'), '0.0000000')
assert.equal(balance(account, 'USDC'), '15.0000000')
assert.equal(balance(target, 'USDC'), '2.0000000')
assert.equal(balance(target, 'XLM'), '0.0000000')
assert.equal(hot.num_sponsoring, 2)
const result = { checkedAt: new Date().toISOString(), network: 'testnet', hash, ledger: record.ledger,
  successful: true, senderRefund: '2 USDC', feeChargedStroops: record.fee_charged, senderUsdc: balance(account, 'USDC'),
  senderXlm: balance(account, 'XLM'), recipientUsdc: balance(target, 'USDC'), recipientXlm: balance(target, 'XLM'),
  originalBalancesRemoved: true, requiredSignaturesVerified: true, remainingSponsorUnits: hot.num_sponsoring,
  remainingEarlierReissue: '1 USDC until 2026-10-31T02:02:00Z', chainWrites: 0 }
writeFileSync('docs/reviews/2026-10-01/renewal/refund.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
