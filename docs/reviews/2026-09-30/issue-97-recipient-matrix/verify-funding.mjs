import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'

const receiptPath = process.argv[2]
if (!receiptPath) throw new Error('Provide the public funding receipt path.')
const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
const base = 'https://horizon-testnet.stellar.org'
async function get(path) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`Public Horizon read failed: HTTP ${response.status}`)
  return response.json()
}
const root = await get('/')
if (root.network_passphrase !== Networks.TESTNET) throw new Error('Testnet identity mismatch.')
const reviewed = receipt.reviewed
const sender = reviewed.principalOwner
const sponsor = reviewed.source
const recipient = reviewed.recipientBefore.address
const [record, operationPage, effectPage, ledger, senderAccount, sponsorAccount, recipientAccount, ...balances] = await Promise.all([
  get(`/transactions/${receipt.hash}`), get(`/transactions/${receipt.hash}/operations?limit=100`),
  get(`/transactions/${receipt.hash}/effects?limit=100`), get(`/ledgers/${receipt.ledger}`),
  get(`/accounts/${sender}`), get(`/accounts/${sponsor}`), get(`/accounts/${recipient}`),
  ...reviewed.balanceIds.map(id => get(`/claimable_balances/${id}`)),
])
const transaction = TransactionBuilder.fromXDR(record.envelope_xdr, Networks.TESTNET)
if (!(transaction instanceof Transaction)) throw new Error('Unexpected fee-bump envelope.')
const signaturesValid = transaction.signatures.length === 2 && [sender, sponsor].every(address => {
  const key = Keypair.fromPublicKey(address)
  return transaction.signatures.filter(signature => key.signatureHint().equals(signature.hint()) &&
    key.verify(transaction.hash(), signature.signature())).length === 1
})
const ops = transaction.operations
const usdc = account => account.balances.find(b => `${b.asset_code}:${b.asset_issuer}` === reviewed.asset)
const native = account => account.balances.find(b => b.asset_type === 'native')
const units = account => 2 + account.subentry_count + account.num_sponsoring - account.num_sponsored
const assertions = {
  successfulExactTransaction: record.successful && record.hash === receipt.hash && transaction.hash().toString('hex') === receipt.hash && record.ledger === receipt.ledger,
  sourceAndFeePayerAreSponsor: transaction.source === sponsor && record.fee_account === sponsor && record.source_account === sponsor,
  exactRequiredSignatures: signaturesValid,
  exactSponsorshipBracket: ops.length === 4 && ops[0].type === 'beginSponsoringFutureReserves' && ops[0].sponsoredId === sender &&
    (ops[0].source ?? transaction.source) === sponsor && ops[3].type === 'endSponsoringFutureReserves' && ops[3].source === sender,
  exactSenderPrincipalOperations: [1, 2].every(index => ops[index].type === 'createClaimableBalance' && ops[index].source === sender &&
    ops[index].asset.toString() === reviewed.asset && ops[index].amount === '1.0000000' && transaction.getClaimableBalanceId(index) === reviewed.balanceIds[index - 1]),
  exactBalancePredicatesAndSponsors: balances.every((balance, index) => {
    const expiry = String(Math.floor(new Date(reviewed.expiries[index]).getTime() / 1000))
    return balance.id === reviewed.balanceIds[index] && balance.asset === reviewed.asset && balance.amount === '1.0000000' && balance.sponsor === sponsor &&
      balance.claimants.length === 2 && balance.claimants[0].destination === reviewed.publicKeys[index] && balance.claimants[0].predicate.abs_before_epoch === expiry &&
      balance.claimants[1].destination === sender && balance.claimants[1].predicate.not.abs_before_epoch === expiry
  }),
  senderBalanceMatchesExactDebit: new Decimal(receipt.before.sender.usdc).minus(usdc(senderAccount).balance).equals(2) && native(senderAccount).balance === '0.0000000',
  recipientPreserved: usdc(recipientAccount).balance === reviewed.recipientBefore.usdc && native(recipientAccount).balance === reviewed.recipientBefore.native &&
    recipientAccount.sponsor === reviewed.recipientBefore.accountSponsor && usdc(recipientAccount).sponsor === reviewed.recipientBefore.trustlineSponsor && recipientAccount.num_sponsored === reviewed.recipientBefore.numSponsored,
  exactFeeAndFourReserveUnits: record.fee_charged === '400' && new Decimal(receipt.before.sponsor.native).minus(native(sponsorAccount).balance).mul(10000000).equals(record.fee_charged) &&
    sponsorAccount.num_sponsoring === receipt.before.sponsor.numSponsoring + 4 &&
    new Decimal(ledger.base_reserve_in_stroops).mul(units(sponsorAccount)).div(10000000).equals('3'),
}
const proof = { checkedAtUTC: new Date().toISOString(), networkPassphrase: root.network_passphrase,
  assertions, acceptancePassed: Object.values(assertions).every(Boolean),
  record, operations: operationPage._embedded.records, effects: effectPage._embedded.records, ledger,
  senderAccount, sponsorAccount, recipientAccount, balances }
const output = join(dirname(receiptPath), `independent-funding-proof-${proof.checkedAtUTC.replace(/[:.]/g, '-')}.json`)
await writeFile(output, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' })
process.stdout.write(JSON.stringify({ output, hash: record.hash, ledger: record.ledger, assertions, acceptancePassed: proof.acceptancePassed }) + '\n')
if (!proof.acceptancePassed) process.exitCode = 1
