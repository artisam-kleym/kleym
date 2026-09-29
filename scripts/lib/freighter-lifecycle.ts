/** Issue #97 spike builders. Fixed official Testnet USDC and two 1-USDC links. */
import { Keypair, Networks, Operation, StrKey, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { claimantsFor } from '../../src/lib/stellar/batch'
import { BOOTSTRAP_ASSET } from './freighter-bootstrap'

export function buildProofFunding(input: {
  sponsorAccount: ConstructorParameters<typeof TransactionBuilder>[0]
  sender: string
  publicKeys: string[]
  expiries: Date[]
  baseFee: string
}) {
  if (input.publicKeys.length !== 2 || new Set(input.publicKeys).size !== 2 ||
      input.publicKeys.some((key) => key === input.sender || !StrKey.isValidEd25519PublicKey(key)) ||
      input.expiries.length !== 2 || input.expiries.some((date) => !Number.isFinite(date.getTime()))) {
    throw new Error('Expected two distinct public link keys and valid expiries.')
  }
  const builder = new TransactionBuilder(input.sponsorAccount, { fee: input.baseFee, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: input.sender }))
  input.publicKeys.forEach((key, i) => builder.addOperation(Operation.createClaimableBalance({
    source: input.sender, asset: BOOTSTRAP_ASSET, amount: '1',
    claimants: claimantsFor(key, input.sender, input.expiries[i]),
  })))
  const transaction = builder.addOperation(Operation.endSponsoringFutureReserves({ source: input.sender })).setTimeout(300).build()
  return { transaction, balanceIds: [transaction.getClaimableBalanceId(1), transaction.getClaimableBalanceId(2)] }
}

export function buildProofReclaim(sponsorAccount: ConstructorParameters<typeof TransactionBuilder>[0], sender: string, balanceId: string, baseFee: string) {
  return new TransactionBuilder(sponsorAccount, { fee: baseFee, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.claimClaimableBalance({ balanceId, source: sender }))
    .setTimeout(300).build()
}

export function verifyProofSignatures(original: Transaction, signedXdr: string, expectedSigners: string[]): Transaction {
  const parsed = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET)
  if (!(parsed instanceof Transaction) || !parsed.hash().equals(original.hash())) throw new Error('The signed body differs from the reviewed transaction.')
  if (new Set(expectedSigners).size !== expectedSigners.length || parsed.signatures.length !== expectedSigners.length) {
    throw new Error('Wrong signature count for this proof step.')
  }
  const remaining = new Set(expectedSigners)
  for (const signature of parsed.signatures) {
    const matched = [...remaining].find((address) => {
      const key = Keypair.fromPublicKey(address)
      return key.signatureHint().equals(signature.hint()) && key.verify(parsed.hash(), signature.signature())
    })
    if (!matched) throw new Error('Invalid, duplicate, foreign or wrong-network signature.')
    remaining.delete(matched)
  }
  return parsed
}
