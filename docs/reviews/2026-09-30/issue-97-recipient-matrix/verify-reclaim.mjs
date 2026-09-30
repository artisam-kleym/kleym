import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'

const paths = process.argv.slice(2)
if (paths.length !== 4) throw new Error('Provide reclaim, funding, materialise and claim public receipt paths.')
const [reclaim, fund, materialise, claim] = await Promise.all(paths.map(async path => JSON.parse(await readFile(path, 'utf8'))))
const base = 'https://horizon-testnet.stellar.org'
async function get(path, allowMissing = false) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(15000) })
  if (allowMissing && response.status === 404) return { httpStatus: 404 }
  if (!response.ok) throw new Error(`Public Horizon read failed: HTTP ${response.status}`)
  return response.json()
}
const root = await get('/')
if (root.network_passphrase !== Networks.TESTNET) throw new Error('Testnet identity mismatch.')
const sender = fund.reviewed.principalOwner, sponsor = fund.reviewed.source
const recipient = claim.reviewed.recipient, ephemeral = fund.reviewed.publicKeys[0]
const [record, fundRecord, materialiseRecord, claimRecord, operations, effects, ledger,
  senderAccount, recipientAccount, sponsorAccount, ephemeralState, claimedBalanceState, reclaimedBalanceState] = await Promise.all([
  get(`/transactions/${reclaim.hash}`), get(`/transactions/${fund.hash}`),
  get(`/transactions/${materialise.hash}`), get(`/transactions/${claim.hash}`),
  get(`/transactions/${reclaim.hash}/operations?limit=100`), get(`/transactions/${reclaim.hash}/effects?limit=100`),
  get(`/ledgers/${reclaim.ledger}`), get(`/accounts/${sender}`), get(`/accounts/${recipient}`), get(`/accounts/${sponsor}`),
  get(`/accounts/${ephemeral}`, true), get(`/claimable_balances/${fund.reviewed.balanceIds[0]}`, true),
  get(`/claimable_balances/${fund.reviewed.balanceIds[1]}`, true),
])
const transaction = TransactionBuilder.fromXDR(record.envelope_xdr, Networks.TESTNET)
if (!(transaction instanceof Transaction)) throw new Error('Unexpected fee-bump envelope.')
const signaturesValid = transaction.signatures.length === 2 && [sender, sponsor].every(address => {
  const key = Keypair.fromPublicKey(address)
  return transaction.signatures.filter(signature => key.signatureHint().equals(signature.hint()) &&
    key.verify(transaction.hash(), signature.signature())).length === 1
})
const fundingTransaction = TransactionBuilder.fromXDR(fundRecord.envelope_xdr, Networks.TESTNET)
const originalBalance = fundingTransaction.operations[2]
const senderPredicate = originalBalance.claimants[1]
const expiry = Math.floor(new Date(fund.reviewed.expiries[1]).getTime() / 1000)
const asset = fund.reviewed.asset
const usdc = account => account.balances.find(b => `${b.asset_code}:${b.asset_issuer}` === asset)
const native = account => account.balances.find(b => b.asset_type === 'native')
const chargedFees = [fundRecord, materialiseRecord, claimRecord, record].reduce((total, tx) => total.plus(tx.fee_charged), new Decimal(0))
const assertions = {
  exactConfirmedTransaction: record.successful && record.hash === reclaim.hash && transaction.hash().toString('hex') === reclaim.hash && record.ledger === reclaim.ledger,
  sponsorSourceAndFeePayer: transaction.source === sponsor && record.source_account === sponsor && record.fee_account === sponsor,
  exactSponsorAndSenderSignatures: signaturesValid,
  onlySenderAuthorisedReclaimOperation: transaction.operations.length === 1 && transaction.operations[0].type === 'claimClaimableBalance' &&
    transaction.operations[0].source === sender && transaction.operations[0].balanceId === fund.reviewed.balanceIds[1],
  originalPrincipalAndPredicate: originalBalance.type === 'createClaimableBalance' && originalBalance.source === sender &&
    originalBalance.asset.toString() === asset && originalBalance.amount === '1.0000000' && senderPredicate.destination === sender &&
    senderPredicate.predicate.switch().name === 'claimPredicateNot' &&
    senderPredicate.predicate.notPredicate().switch().name === 'claimPredicateBeforeAbsoluteTime' &&
    senderPredicate.predicate.notPredicate().absBefore().toString() === String(expiry) &&
    fundingTransaction.getClaimableBalanceId(2) === reclaim.reviewed.balanceId,
  confirmedLedgerAfterExpiry: Date.parse(ledger.closed_at) / 1000 >= expiry && record.ledger > claimRecord.ledger,
  exactReturnedUsdcAndZeroXlm: new Decimal(usdc(senderAccount).balance).minus(reclaim.before.sender.usdc).equals(1) &&
    usdc(senderAccount).balance === '18.0000000' && native(senderAccount).balance === '0.0000000',
  recipientAndPersistentSponsorshipPreserved: usdc(recipientAccount).balance === '2.0000000' && native(recipientAccount).balance === '0.0000000' &&
    recipientAccount.sponsor === claim.reviewed.recipientBefore.accountSponsor && usdc(recipientAccount).sponsor === claim.reviewed.recipientBefore.trustlineSponsor &&
    recipientAccount.num_sponsored === 3 && senderAccount.sponsor === fund.before.sender.accountSponsor && usdc(senderAccount).sponsor === fund.before.sender.trustlineSponsor,
  allTemporaryEntriesRemoved: ephemeralState.httpStatus === 404 && claimedBalanceState.httpStatus === 404 && reclaimedBalanceState.httpStatus === 404,
  twoReserveUnitsReleasedAndNoneRemain: reclaim.before.sponsor.numSponsoring === 2 && sponsorAccount.num_sponsoring === 0 &&
    new Decimal(ledger.base_reserve_in_stroops).mul(2 + sponsorAccount.subentry_count + sponsorAccount.num_sponsoring - sponsorAccount.num_sponsored).div(10000000).equals(1),
  exactFeeAndCompleteLifecycleFeeDebit: record.fee_charged === '100' && chargedFees.equals(1500) &&
    new Decimal(fund.before.sponsor.native).minus(native(sponsorAccount).balance).mul(10000000).equals(chargedFees),
  principalConserved: new Decimal(usdc(senderAccount).balance).plus(usdc(recipientAccount).balance).equals(20),
}
const proof = { checkedAtUTC: new Date().toISOString(), networkPassphrase: root.network_passphrase,
  assertions, acceptancePassed: Object.values(assertions).every(Boolean), totalFeeChargedStroops: chargedFees.toFixed(0),
  record, fundRecord, materialiseRecord, claimRecord, operations: operations._embedded.records, effects: effects._embedded.records,
  ledger, senderAccount, recipientAccount, sponsorAccount, ephemeralState, claimedBalanceState, reclaimedBalanceState }
const output = join(dirname(paths[0]), `independent-reclaim-proof-${proof.checkedAtUTC.replace(/[:.]/g, '-')}.json`)
await writeFile(output, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' })
process.stdout.write(JSON.stringify({ output, hash: record.hash, ledger: record.ledger, ledgerClosedAt: ledger.closed_at,
  totalFeeChargedStroops: proof.totalFeeChargedStroops, assertions, acceptancePassed: proof.acceptancePassed }) + '\n')
if (!proof.acceptancePassed) process.exitCode = 1
