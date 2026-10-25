/** Ledger-enforced wallet claim. No link key can move this balance. */
import { Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import type { ClaimContext, ClaimPlan, LedgerFacts } from './claim'

export function buildWalletClaim(context: ClaimContext, facts: LedgerFacts): ClaimPlan {
  if (context.conversion || context.memo) throw new Error('Wallet-bound claims receive the original asset in the assigned wallet.')
  const wallet = context.recipientPublicKey
  const builder = new TransactionBuilder(context.sponsorAccount, { fee: context.baseFee, networkPassphrase: context.networkPassphrase })
  if (!facts.recipientExists) {
    builder.addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: wallet, source: context.sponsorPublicKey }))
    builder.addOperation(Operation.createAccount({ destination: wallet, startingBalance: '0', source: context.sponsorPublicKey }))
    builder.addOperation(Operation.endSponsoringFutureReserves({ source: wallet }))
  }
  if (!context.asset.isNative() && !facts.recipientTrusts) {
    builder.addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: wallet, source: context.sponsorPublicKey }))
    builder.addOperation(Operation.changeTrust({ asset: context.asset, source: wallet }))
    builder.addOperation(Operation.endSponsoringFutureReserves({ source: wallet }))
  }
  builder.addOperation(Operation.claimClaimableBalance({ balanceId: context.balanceId, source: wallet }))
  const tx = builder.setTimeout(180).build()
  return { xdr: tx.toXDR(), operations: tx.operations.length, needsRecipientSignature: true,
    recipientExists: facts.recipientExists, recipientTrusts: facts.recipientTrusts }
}
