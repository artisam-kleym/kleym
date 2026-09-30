import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'

const receiptPath = process.argv[2]
if (!receiptPath) throw new Error('Provide the public account-only bootstrap receipt path.')
const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
if (receipt.mode !== 'recipient-account-only' || receipt.target !== receipt.recipient) throw new Error('Expected account-only recipient setup.')
const preflight = JSON.parse(await readFile(join(dirname(receiptPath), 'preflight.json'), 'utf8'))
const base = 'https://horizon-testnet.stellar.org'
async function get(path) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`Public Horizon read failed: HTTP ${response.status}`)
  return response.json()
}
const root = await get('/')
if (root.network_passphrase !== Networks.TESTNET) throw new Error('Testnet identity mismatch.')
const [record, operationPage, effectPage, ledger, targetAccount, sponsorAccount, senderAccount] = await Promise.all([
  get(`/transactions/${receipt.hash}`), get(`/transactions/${receipt.hash}/operations?limit=100`),
  get(`/transactions/${receipt.hash}/effects?limit=100`), get(`/ledgers/${receipt.ledger}`),
  get(`/accounts/${receipt.target}`), get(`/accounts/${receipt.sponsor}`), get(`/accounts/${receipt.sender}`),
])
const tx = TransactionBuilder.fromXDR(record.envelope_xdr, Networks.TESTNET)
if (!(tx instanceof Transaction)) throw new Error('Unexpected fee-bump envelope.')
const operations = tx.operations
const native = account => account.balances.find(balance => balance.asset_type === 'native')
const minimum = account => new Decimal(ledger.base_reserve_in_stroops)
  .mul(2 + account.subentry_count + account.num_sponsoring - account.num_sponsored).div(10_000_000)
const signerSet = [receipt.sponsor, receipt.target]
const signatureSetValid = tx.signatures.length === 2 && signerSet.every(address => {
  const key = Keypair.fromPublicKey(address)
  return tx.signatures.filter(signature => key.signatureHint().equals(signature.hint()) &&
    key.verify(tx.hash(), signature.signature())).length === 1
})
const oldSender = preflight.senderAccount.body
const senderFields = ['account_id', 'sequence', 'balances', 'signers', 'thresholds', 'flags', 'sponsor', 'subentry_count', 'num_sponsored', 'num_sponsoring']
const assertions = {
  targetWasAbsentBeforeSetup: preflight.acceptancePassed === true && preflight.recipient === receipt.target && preflight.targetAccount.httpStatus === 404,
  successfulExactTransaction: record.successful === true && record.hash === receipt.hash && tx.hash().toString('hex') === receipt.hash && record.ledger === receipt.ledger,
  sponsorSourceAndFeePayer: tx.source === receipt.sponsor && record.source_account === receipt.sponsor && record.fee_account === receipt.sponsor,
  exactSponsorAndRecipientSignatures: signatureSetValid,
  exactAccountOnlyOperations: operations.length === 3 &&
    operations[0].type === 'beginSponsoringFutureReserves' && operations[0].sponsoredId === receipt.target && (operations[0].source ?? tx.source) === receipt.sponsor &&
    operations[1].type === 'createAccount' && operations[1].destination === receipt.target && operations[1].startingBalance === '0.0000000' && (operations[1].source ?? tx.source) === receipt.sponsor &&
    operations[2].type === 'endSponsoringFutureReserves' && operations[2].source === receipt.target &&
    operationPage._embedded.records.length === 3 && operationPage._embedded.records.every(operation => operation.transaction_successful === true),
  targetZeroNativeAndNoTrustline: targetAccount.balances.length === 1 && native(targetAccount)?.balance === '0.0000000' && targetAccount.subentry_count === 0 && minimum(targetAccount).equals(0),
  targetTwoSponsoredAccountUnits: targetAccount.sponsor === receipt.sponsor && targetAccount.num_sponsored === 2 && targetAccount.num_sponsoring === 0,
  exactSponsorFeeAndReserveDebit: record.fee_charged === '300' &&
    new Decimal(receipt.sponsorBefore.nativeBalance).minus(native(sponsorAccount).balance).mul(10_000_000).equals(record.fee_charged) &&
    sponsorAccount.num_sponsoring === receipt.sponsorBefore.numSponsoring + 2 &&
    minimum(sponsorAccount).minus(receipt.sponsorBefore.minimumReserve).equals('1.0000000'),
  senderStatePreserved: preflight.sender === receipt.sender && senderFields.every(field => JSON.stringify(oldSender[field]) === JSON.stringify(senderAccount[field])),
}
const proof = { checkedAtUTC: new Date().toISOString(), networkPassphrase: root.network_passphrase,
  assertions, acceptancePassed: Object.values(assertions).every(Boolean),
  record, operations: operationPage._embedded.records, effects: effectPage._embedded.records, ledger,
  targetAccount, sponsorAccount, senderAccount,
  scope: 'Independent account-only setup proof at this stage. Sender and recipient snapshots change during the later lifecycle.' }
const output = join(dirname(receiptPath), `independent-bootstrap-proof-${proof.checkedAtUTC.replace(/[:.]/g, '-')}.json`)
await writeFile(output, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' })
process.stdout.write(JSON.stringify({ output, hash: record.hash, ledger: record.ledger, assertions, acceptancePassed: proof.acceptancePassed }) + '\n')
if (!proof.acceptancePassed) process.exitCode = 1
