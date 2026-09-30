/** Testnet spike fixture only. No sender key or link seed enters this module. */
import { Asset, Keypair, Networks, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { stellarMetadata } from '../../src/lib/stellar/network'
import Decimal from 'decimal.js'

export const BOOTSTRAP_ASSET = new Asset('USDC', stellarMetadata('testnet').defaultAsset.assetIssuer)
export type BootstrapMode = 'sender-usdc' | 'recipient-account-only'

/** Classic fixture bid: live ledger base fee with headroom, bounded as before.
 * Historical charged-fee percentiles are observations, not required minima.
 */
export function bootstrapFeePerOperation(lastLedgerBaseFee: string): string {
  if (!/^[1-9][0-9]*$/.test(lastLedgerBaseFee)) throw new Error('Invalid Testnet ledger base fee.')
  const minimum = new Decimal(lastLedgerBaseFee)
  if (minimum.gt(10_000)) throw new Error('Testnet ledger base fee exceeds the fixture cap; retry later.')
  return Decimal.min(Decimal.max(minimum.mul(10), 1000), 10_000).toFixed(0)
}

export function buildSponsoredSenderBootstrap(sponsor: ConstructorParameters<typeof TransactionBuilder>[0], sender: string, baseFee: string): Transaction {
  return buildSponsoredBootstrap(sponsor, sender, baseFee, 'sender-usdc')
}

export function buildSponsoredBootstrap(sponsor: ConstructorParameters<typeof TransactionBuilder>[0], target: string, baseFee: string, mode: BootstrapMode): Transaction {
  if (mode !== 'sender-usdc' && mode !== 'recipient-account-only') throw new Error('Invalid bootstrap mode.')
  const builder = new TransactionBuilder(sponsor, { fee: baseFee, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: target }))
    .addOperation(Operation.createAccount({ destination: target, startingBalance: '0' }))
  if (mode === 'sender-usdc') builder.addOperation(Operation.changeTrust({ asset: BOOTSTRAP_ASSET, limit: '100', source: target }))
  return builder.addOperation(Operation.endSponsoringFutureReserves({ source: target }))
    .setTimeout(300)
    .build()
}

/** Require the reviewed body and exactly the sponsor/target wallet signatures. */
export function verifyBootstrapSignature(original: Transaction, xdr: string, target: string): Transaction {
  const signed = TransactionBuilder.fromXDR(xdr, Networks.TESTNET)
  if (!(signed instanceof Transaction) || !signed.hash().equals(original.hash())) {
    throw new Error('The wallet changed the reviewed transaction.')
  }
  if (signed.signatures.length !== 2) throw new Error('Expected exactly the target wallet and sponsor signatures.')
  const expected = [target, original.source]
  const matched = new Set<string>()
  for (const signature of signed.signatures) {
    const key = expected.find((address) => {
      // SDK verifies the Ed25519 signature, not merely its four-byte hint.
      const pair = Keypair.fromPublicKey(address)
      return pair.signatureHint().equals(signature.hint()) && pair.verify(signed.hash(), signature.signature())
    })
    if (!key || matched.has(key)) throw new Error('Invalid, duplicate or unexpected transaction signature.')
    matched.add(key)
  }
  if (matched.size !== 2) throw new Error('The target wallet must sign the transaction.')
  return signed
}
