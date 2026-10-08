import { Account, Claimant, Keypair, Networks, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { describe, expect, it } from 'vitest'
import { buildProofFunding, buildProofReclaim, recipientProofRequirements, verifyProofSignatures } from '../../scripts/lib/freighter-lifecycle'
import { BOOTSTRAP_ASSET } from '../../scripts/lib/freighter-bootstrap'
import { buildClaim } from '../../src/lib/stellar/claim'

describe('sponsored Freighter lifecycle spike', () => {
  const sponsor = Keypair.random(), sender = Keypair.random(), ephemeral = Keypair.random(), second = Keypair.random()
  const expiries = [new Date('2026-09-30T00:00:00Z'), new Date('2026-09-29T23:00:00Z')]
  const build = (publicKeys = [ephemeral.publicKey(), second.publicKey()]) => buildProofFunding({ sponsorAccount: new Account(sponsor.publicKey(), '10'), sender: sender.publicKey(), publicKeys, expiries, baseFee: '1000' })
  it('sources principal from sender and fee/reserves from sponsor with deterministic balance IDs', () => {
    const { transaction: tx, balanceIds } = build()
    expect(tx.source).toBe(sponsor.publicKey())
    expect(tx.fee).toBe('4000')
    expect(tx.operations.map(op => op.type)).toEqual(['beginSponsoringFutureReserves', 'createClaimableBalance', 'createClaimableBalance', 'endSponsoringFutureReserves'])
    expect(tx.operations[0]).toMatchObject({ sponsoredId: sender.publicKey() })
    for (const i of [1, 2]) {
      expect(tx.operations[i]).toMatchObject({ source: sender.publicKey(), asset: BOOTSTRAP_ASSET, amount: '1.0000000' })
      const op = tx.operations[i]
      if (op.type !== 'createClaimableBalance') throw new Error('wrong type')
      expect(op.claimants.map(c => c.destination)).toEqual([i === 1 ? ephemeral.publicKey() : second.publicKey(), sender.publicKey()])
      expect(op.claimants[1].predicate.toXDR()).toEqual(Claimant.predicateNot(op.claimants[0].predicate).toXDR())
      expect(balanceIds[i - 1]).toBe(tx.getClaimableBalanceId(i))
    }
    expect(new Set(balanceIds).size).toBe(2)
  })
  it('rejects missing, duplicate, seed and sender-as-link registrations', () => {
    for (const keys of [[], [ephemeral.publicKey()], [ephemeral.publicKey(), ephemeral.publicKey()], [ephemeral.secret(), second.publicKey()], [sender.publicKey(), second.publicKey()]]) {
      expect(() => build(keys)).toThrow('distinct public')
    }
  })
  it('verifies exactly the owner signatures and rejects tampered principal or extra signatures', () => {
    const original = build().transaction
    original.sign(sponsor)
    const signed = TransactionBuilder.fromXDR(original.toXDR(), Networks.TESTNET)
    signed.sign(sender)
    expect(verifyProofSignatures(original, signed.toXDR(), [sponsor.publicKey(), sender.publicKey()]).hash()).toEqual(original.hash())
    expect(() => verifyProofSignatures(original, original.toXDR(), [sponsor.publicKey(), sender.publicKey()])).toThrow('count')
    signed.sign(ephemeral)
    expect(() => verifyProofSignatures(original, signed.toXDR(), [sponsor.publicKey(), sender.publicKey()])).toThrow('count')
    const altered = new TransactionBuilder(new Account(sponsor.publicKey(), '10'), { fee: '1000', networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.payment({ asset: BOOTSTRAP_ASSET, destination: sponsor.publicKey(), amount: '2', source: sender.publicKey() })).setTimeout(300).build()
    altered.sign(sponsor, sender)
    expect(() => verifyProofSignatures(original, altered.toXDR(), [sponsor.publicKey(), sender.publicKey()])).toThrow('differs')
  })
  it('checks three-party claim signatures and refuses foreign/wrong-network signers', () => {
    const original = build().transaction
    const signers = [sponsor.publicKey(), sender.publicKey(), ephemeral.publicKey()]
    original.sign(sponsor, sender, ephemeral)
    expect(verifyProofSignatures(original, original.toXDR(), signers).signatures).toHaveLength(3)
    for (const keys of [[sponsor, sender, second], [sponsor, sender, sponsor]]) {
      const unsigned = build().transaction
      const wrong = TransactionBuilder.fromXDR(unsigned.toXDR(), Networks.TESTNET)
      wrong.sign(...keys)
      expect(() => verifyProofSignatures(unsigned, wrong.toXDR(), signers)).toThrow('signature')
    }
    const wrongNetwork = TransactionBuilder.fromXDR(original.toXDR(), Networks.PUBLIC)
    wrongNetwork.signatures.splice(0)
    wrongNetwork.sign(sponsor, sender, ephemeral)
    expect(() => verifyProofSignatures(original, wrongNetwork.toXDR(), signers)).toThrow('signature')
  })
  it('uses sponsor fee source and sender operation authority for exact expiry reclaim', () => {
    const id = build().balanceIds[1]
    const tx = buildProofReclaim(new Account(sponsor.publicKey(), '11'), sender.publicKey(), id, '1000')
    expect(tx.source).toBe(sponsor.publicKey())
    expect(tx.operations).toEqual([{ type: 'claimClaimableBalance', source: sender.publicKey(), balanceId: id }])
    expect(tx.fee).toBe('1000')
  })
  it.each([
    { name: 'absent', exists: false, trusts: false, signer: true, reserves: 3 },
    { name: 'existing without trustline', exists: true, trusts: false, signer: true, reserves: 1 },
    { name: 'existing with trustline', exists: true, trusts: true, signer: false, reserves: 0 },
  ])('derives recipient authority and reserve units from $name TX2 operations', ({ exists, trusts, signer, reserves }) => {
    const recipient = Keypair.random()
    const plan = buildClaim({ sponsorAccount: new Account(sponsor.publicKey(), '11'), sponsorPublicKey: sponsor.publicKey(),
      ephemeralPublicKey: ephemeral.publicKey(), recipientPublicKey: recipient.publicKey(), asset: BOOTSTRAP_ASSET,
      amount: '1.0000000', balanceId: build().balanceIds[0], networkPassphrase: Networks.TESTNET, baseFee: '1000' },
    { ephemeralExists: true, ephemeralTrusts: true, recipientExists: exists, recipientTrusts: trusts })
    const transaction = TransactionBuilder.fromXDR(plan.xdr, Networks.TESTNET)
    expect(transaction).toBeInstanceOf(Transaction)
    const requirements = recipientProofRequirements(transaction as Transaction, recipient.publicKey())
    expect(requirements).toEqual({ needsRecipientSignature: signer, newReserveUnits: reserves })
    expect(plan.needsRecipientSignature).toBe(signer)
  })
})
