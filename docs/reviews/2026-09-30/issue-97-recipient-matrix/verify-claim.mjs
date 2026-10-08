import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'

const paths = process.argv.slice(2)
if (paths.length !== 3) throw new Error('Provide claim, materialise and funding public receipt paths.')
const [claim, materialise, fund] = await Promise.all(paths.map(async path => JSON.parse(await readFile(path, 'utf8'))))
const base = 'https://horizon-testnet.stellar.org'
async function get(path, allowMissing = false) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(15000) })
  if (allowMissing && response.status === 404) return { httpStatus: 404 }
  if (!response.ok) throw new Error(`Public Horizon read failed: HTTP ${response.status}`)
  return response.json()
}
const root = await get('/')
if (root.network_passphrase !== Networks.TESTNET) throw new Error('Testnet identity mismatch.')
const sponsor = fund.reviewed.source, sender = fund.reviewed.principalOwner
const ephemeral = fund.reviewed.publicKeys[0], recipient = claim.reviewed.recipient
const [tx1Record, tx2Record, tx1Ops, tx2Ops, tx2Effects, senderAccount, recipientAccount, sponsorAccount,
  ephemeralState, claimedBalanceState, remainingBalance, latestPage] = await Promise.all([
  get(`/transactions/${materialise.hash}`), get(`/transactions/${claim.hash}`),
  get(`/transactions/${materialise.hash}/operations?limit=100`), get(`/transactions/${claim.hash}/operations?limit=100`),
  get(`/transactions/${claim.hash}/effects?limit=100`), get(`/accounts/${sender}`), get(`/accounts/${recipient}`),
  get(`/accounts/${sponsor}`), get(`/accounts/${ephemeral}`, true),
  get(`/claimable_balances/${fund.reviewed.balanceIds[0]}`, true),
  get(`/claimable_balances/${fund.reviewed.balanceIds[1]}`), get('/ledgers?order=desc&limit=1'),
])
const tx1 = TransactionBuilder.fromXDR(tx1Record.envelope_xdr, Networks.TESTNET)
const tx2 = TransactionBuilder.fromXDR(tx2Record.envelope_xdr, Networks.TESTNET)
function exactSignatures(transaction, addresses) {
  return transaction instanceof Transaction && transaction.signatures.length === addresses.length && addresses.every(address => {
    const key = Keypair.fromPublicKey(address)
    return transaction.signatures.filter(signature => key.signatureHint().equals(signature.hint()) &&
      key.verify(transaction.hash(), signature.signature())).length === 1
  })
}
const asset = fund.reviewed.asset
const usdc = account => account.balances.find(b => `${b.asset_code}:${b.asset_issuer}` === asset)
const native = account => account.balances.find(b => b.asset_type === 'native')
const ops1 = tx1.operations, ops2 = tx2.operations
const latest = latestPage._embedded.records[0]
const expiry = Number(remainingBalance.claimants[1].predicate.not.abs_before_epoch)
const assertions = {
  exactConfirmedTransactions: [tx1Record, tx2Record].every(record => record.successful && record.source_account === sponsor && record.fee_account === sponsor) &&
    tx1.hash().toString('hex') === materialise.hash && tx2.hash().toString('hex') === claim.hash,
  exactSignaturesWithoutRecipient: exactSignatures(tx1, [sponsor, ephemeral]) && exactSignatures(tx2, [sponsor, ephemeral]),
  materialiseExactSponsoredAccountAndTrustline: ops1.length === 6 &&
    [0, 3].every(i => ops1[i].type === 'beginSponsoringFutureReserves' && ops1[i].source === sponsor && ops1[i].sponsoredId === ephemeral) &&
    ops1[1].type === 'createAccount' && ops1[1].source === sponsor && ops1[1].destination === ephemeral && ops1[1].startingBalance === '0.0000000' &&
    [2, 5].every(i => ops1[i].type === 'endSponsoringFutureReserves' && ops1[i].source === ephemeral) &&
    ops1[4].type === 'changeTrust' && ops1[4].source === ephemeral && ops1[4].line.toString() === asset,
  exactClaimPaymentAndCleanupOrder: ops2.length === 4 && ops2.every(op => op.source === ephemeral) &&
    ops2[0].type === 'claimClaimableBalance' && ops2[0].balanceId === fund.reviewed.balanceIds[0] &&
    ops2[1].type === 'payment' && ops2[1].destination === recipient && ops2[1].asset.toString() === asset && ops2[1].amount === '1.0000000' &&
    ops2[2].type === 'changeTrust' && ops2[2].line.toString() === asset && ops2[2].limit === '0.0000000' &&
    ops2[3].type === 'accountMerge' && ops2[3].destination === recipient,
  tx2InLaterLedger: tx1Record.ledger === materialise.ledger && tx2Record.ledger === claim.ledger && tx2Record.ledger > tx1Record.ledger,
  recipientExactUsdcAndZeroXlm: new Decimal(usdc(recipientAccount).balance).minus(claim.before.recipient.snapshot.usdc).equals(1) &&
    usdc(recipientAccount).balance === '2.0000000' && native(recipientAccount).balance === '0.0000000',
  recipientPersistentSponsorshipUnchanged: recipientAccount.sponsor === claim.reviewed.recipientBefore.accountSponsor &&
    usdc(recipientAccount).sponsor === claim.reviewed.recipientBefore.trustlineSponsor && recipientAccount.num_sponsored === 3,
  senderPreserved: usdc(senderAccount).balance === '17.0000000' && native(senderAccount).balance === '0.0000000',
  ephemeralAndClaimedBalanceRemoved: ephemeralState.httpStatus === 404 && claimedBalanceState.httpStatus === 404,
  exactSponsorFees: tx1Record.fee_charged === '600' && tx2Record.fee_charged === '400' &&
    new Decimal(fund.before.sponsor.native).minus(native(sponsorAccount).balance).mul(10000000).equals(
      new Decimal(fund.feeChargedStroops).plus(tx1Record.fee_charged).plus(tx2Record.fee_charged)),
  fiveReserveUnitsReleasedWithoutNewRecipientReserves: sponsorAccount.num_sponsoring === 2 &&
    claim.before.sponsor.numSponsoring - sponsorAccount.num_sponsoring === 5,
  remainingBalanceExactAndReclaimAvailable: remainingBalance.id === fund.reviewed.balanceIds[1] && remainingBalance.asset === asset &&
    remainingBalance.amount === '1.0000000' && remainingBalance.sponsor === sponsor && remainingBalance.claimants[1].destination === sender &&
    expiry === Math.floor(new Date(fund.reviewed.expiries[1]).getTime() / 1000) && Date.parse(latest.closed_at) / 1000 >= expiry,
}
const proof = { checkedAtUTC: new Date().toISOString(), networkPassphrase: root.network_passphrase,
  assertions, acceptancePassed: Object.values(assertions).every(Boolean), tx1Record, tx2Record,
  tx1Operations: tx1Ops._embedded.records, tx2Operations: tx2Ops._embedded.records, tx2Effects: tx2Effects._embedded.records,
  senderAccount, recipientAccount, sponsorAccount, ephemeralState, claimedBalanceState, remainingBalance, latestLedger: latest }
const output = join(dirname(paths[0]), `independent-claim-proof-${proof.checkedAtUTC.replace(/[:.]/g, '-')}.json`)
await writeFile(output, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' })
process.stdout.write(JSON.stringify({ output, tx1Hash: tx1Record.hash, tx1Ledger: tx1Record.ledger,
  tx2Hash: tx2Record.hash, tx2Ledger: tx2Record.ledger, assertions, acceptancePassed: proof.acceptancePassed }) + '\n')
if (!proof.acceptancePassed) process.exitCode = 1
