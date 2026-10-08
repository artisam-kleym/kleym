import { describe, expect, it } from 'vitest'
import { Account, Asset, Keypair, Networks, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { buildBatchTransaction, balanceIdsOf, balanceIdsFromResultXdr, verifyBatchTransaction } from '@/lib/stellar/batch'
import { affordability, computeCost } from '@/lib/campaign/cost'
import fixture from '../../fixtures/sponsored-balance-id.json'

const sender = Keypair.random()
const sponsor = Keypair.random()
const links = [1, 2].map((n) => ({ id: `link-${n}`, ephemeralPublicKey: Keypair.random().publicKey(), amount: `${n}` }))
const expected = {
  senderPublicKey: sender.publicKey(), sponsorPublicKey: sponsor.publicKey(),
  asset: new Asset('USDC', Keypair.random().publicKey()), amountPerLink: '1',
  expiresAt: new Date('2027-01-01'), links, networkPassphrase: Networks.TESTNET, baseFee: '1000',
}
function build() {
  const built = buildBatchTransaction({ ...expected, senderAccount: new Account(sender.publicKey(), '4'), sponsorAccount: new Account(sponsor.publicKey(), '8'), timeoutSeconds: 600 })
  const transaction = TransactionBuilder.fromXDR(built.xdr, Networks.TESTNET) as Transaction
  transaction.sign(sender)
  return { built, transaction }
}

describe('sponsor-paid campaign funding', () => {
  it('matches the two balance IDs reported by the verified September 30 Testnet funding', () => {
    const tx = TransactionBuilder.fromXDR(fixture.envelopeXdr, Networks.TESTNET) as Transaction
    expect(tx.hash().toString('hex')).toBe(fixture.hash)
    expect(balanceIdsFromResultXdr(fixture.resultXdr)).toEqual(fixture.balanceIds)
    expect([tx.getClaimableBalanceId(1), tx.getClaimableBalanceId(2)]).toEqual(fixture.balanceIds)
  })
  it('spends sender principal with sponsor sequence, fees and reserves', () => {
    const { transaction, built } = build()
    expect(transaction.source).toBe(sponsor.publicKey())
    expect(transaction.sequence).toBe('9')
    expect(transaction.fee).toBe('4000')
    expect(transaction.operations.map((o) => o.type)).toEqual(['beginSponsoringFutureReserves', 'createClaimableBalance', 'createClaimableBalance', 'endSponsoringFutureReserves'])
    expect(transaction.operations.slice(1).every((o) => o.source === sender.publicKey())).toBe(true)
    expect(verifyBatchTransaction(transaction.toXDR(), { ...expected, preparedHash: transaction.hash().toString('hex') }).ok).toBe(true)
    expect(built.balanceIds).toEqual(balanceIdsOf(transaction, links))
    expect(built.balanceIds[0]!.balanceId).toBe(transaction.getClaimableBalanceId(1))
    expect(built.balanceIds[1]!.balanceId).toBe(transaction.getClaimableBalanceId(2))
  })

  it('refuses an unsigned sender, the wrong network and changed prepared sequence', () => {
    const { transaction } = build()
    const unsigned = TransactionBuilder.fromXDR(transaction.toXDR(), Networks.TESTNET) as Transaction
    unsigned.signatures.splice(0)
    expect(verifyBatchTransaction(unsigned.toXDR(), expected)).toEqual({ ok: false, reason: 'not-signed-by-sender' })
    expect(verifyBatchTransaction(transaction.toXDR(), { ...expected, networkPassphrase: Networks.PUBLIC })).toEqual({ ok: false, reason: 'not-signed-by-sender' })
    expect(verifyBatchTransaction(transaction.toXDR(), { ...expected, preparedHash: '00'.repeat(32) })).toEqual({ ok: false, reason: 'wrong-prepared-transaction' })
  })

  it('refuses a principal debit sourced from the sponsor', () => {
    const { transaction } = build()
    const changed = new TransactionBuilder(new Account(sponsor.publicKey(), '8'), { fee: '1000', networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: sender.publicKey() }))
    for (const link of links) {
      const original = transaction.operations[1]!
      if (original.type !== 'createClaimableBalance') throw new Error('unexpected operation')
      changed.addOperation(Operation.createClaimableBalance({ asset: expected.asset, amount: link.amount, claimants: original.claimants }))
    }
    const bad = changed.addOperation(Operation.endSponsoringFutureReserves({ source: sender.publicKey() })).setTimeout(600).build()
    bad.sign(sender)
    expect(verifyBatchTransaction(bad.toXDR(), expected)).toEqual({ ok: false, reason: 'wrong-source' })
  })

  it('counts sponsorship overhead and permits a zero-XLM USDC sender', () => {
    const cost = computeCost({ amountPerLink: '1', linkCount: 89, reservePerLink: '1', maxOpsPerBatch: 90, baseFeeStroops: '1000', sponsored: true })
    expect(cost).toMatchObject({ totalAmount: '89', totalReserve: '89', totalFee: '0.0093', signatures: 2, batches: 2, sponsored: true })
    expect(affordability(cost, { assetBalance: '89', xlmBalance: '0' }, false)).toEqual({ asset: true, reserve: true })
    expect(affordability(cost, { assetBalance: '88', xlmBalance: '0' }, false)).toEqual({ asset: false, reserve: true })
  })
})
