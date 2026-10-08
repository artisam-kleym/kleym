import { describe, expect, it } from 'vitest'
import { Account, Asset, Claimant, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { requiredSourceXlm } from '@/lib/stellar/source-coordination'
import { buildMaterialise, buildClaim, type ClaimContext } from '@/lib/stellar/claim'
import { parseAttempt } from '@/lib/stellar/attempts'

const sponsor = Keypair.random().publicKey(), ephemeral = Keypair.random().publicKey(), recipient = Keypair.random().publicKey()
const asset = new Asset('USDC', Keypair.random().publicKey())
const context = (): ClaimContext => ({ sponsorAccount: new Account(sponsor, '10'), sponsorPublicKey: sponsor,
  ephemeralPublicKey: ephemeral, recipientPublicKey: recipient, asset, amount: '1', balanceId: '00000000' + 'ab'.repeat(32),
  networkPassphrase: Networks.TESTNET, baseFee: '1000' })
const reserve = new Decimal('0.5')

describe('transaction source capacity', () => {
  it('charges claimant reserves to the sponsor, preserving sender principal', () => {
    const sender = Keypair.random().publicKey()
    const tx = new TransactionBuilder(new Account(sponsor, '10'), { fee: '1000', networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: sender }))
      .addOperation(Operation.createClaimableBalance({ source: sender, asset, amount: '2',
        claimants: [new Claimant(ephemeral, Claimant.predicateUnconditional()), new Claimant(sender, Claimant.predicateUnconditional())] }))
      .addOperation(Operation.endSponsoringFutureReserves({ source: sender })).setTimeout(180).build()
    expect(requiredSourceXlm(tx, reserve).toFixed(7)).toBe('1.0003000')
  })
  it('budgets ephemeral account and trustline creation using live base reserve', () => {
    const tx = parseAttempt(buildMaterialise(context(), { ephemeralTrusts: false }).xdr)
    expect(requiredSourceXlm(tx, new Decimal('0.7')).toFixed(7)).toBe('2.1006000')
  })
  it.each([
    ['absent', false, false, '1.5010000'],
    ['no trustline', true, false, '0.5007000'],
    ['trusted', true, true, '0.0004000'],
  ])('budgets %s recipient without borrowing future reserve releases', (_mode, exists, trusts, expected) => {
    const plan = buildClaim(context(), { ephemeralExists: true, ephemeralTrusts: true, recipientExists: exists, recipientTrusts: trusts })
    expect(requiredSourceXlm(parseAttempt(plan.xdr), reserve).toFixed(7)).toBe(expected)
  })
  it('includes native principal when the source itself pays it', () => {
    const tx = new TransactionBuilder(new Account(sponsor, '10'), { fee: '1000', networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.payment({ destination: recipient, asset: Asset.native(), amount: '3.1234567' }))
      .setTimeout(180).build()
    expect(requiredSourceXlm(tx, reserve).toFixed(7)).toBe('3.1235567')
  })
})
