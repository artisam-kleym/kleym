/**
 * The claim transactions. SPEC.md §3.3 — the shapes the #1 spike proved.
 *
 * These assert the op lists and, more importantly, the two rules that made the
 * original single-transaction design fail: the ephemeral trustline must be
 * removed BEFORE the merge, and the recipient must not sign when they are not
 * an operation source. Both were observed on testnet, not reasoned about.
 */
import { describe, expect, it } from 'vitest'
import { Account, Asset, Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { buildClaim, buildMaterialise, signAsSponsor, type ClaimContext } from '@/lib/stellar/claim'

const PASSPHRASE = Networks.TESTNET
const sponsor = Keypair.random()
const ephemeral = Keypair.random()
const recipient = Keypair.random()
const issuer = Keypair.random()
const USDC = new Asset('USDC', issuer.publicKey())

function context(asset: Asset): ClaimContext {
  return {
    sponsorAccount: new Account(sponsor.publicKey(), '100'),
    sponsorPublicKey: sponsor.publicKey(),
    ephemeralPublicKey: ephemeral.publicKey(),
    recipientPublicKey: recipient.publicKey(),
    asset,
    amount: '2.5000000',
    balanceId: `00000000${'a'.repeat(64)}`,
    networkPassphrase: PASSPHRASE,
    baseFee: '1000',
  }
}

const parse = (xdr: string) => TransactionBuilder.fromXDR(xdr, PASSPHRASE) as Transaction
const types = (xdr: string) => parse(xdr).operations.map((op) => op.type)

describe('TX1 — materialise', () => {
  it('creates the ephemeral account, sponsored, for a native asset', () => {
    const { xdr } = buildMaterialise(context(Asset.native()), { ephemeralTrusts: false })
    expect(types(xdr)).toEqual([
      'beginSponsoringFutureReserves',
      'createAccount',
      'endSponsoringFutureReserves',
    ])
  })

  it('adds a sponsored trustline for a non-native asset', () => {
    const { xdr } = buildMaterialise(context(USDC), { ephemeralTrusts: false })
    expect(types(xdr)).toEqual([
      'beginSponsoringFutureReserves',
      'createAccount',
      'endSponsoringFutureReserves',
      'beginSponsoringFutureReserves',
      'changeTrust',
      'endSponsoringFutureReserves',
    ])
  })

  it('skips the trustline when the ephemeral account already holds one', () => {
    const { xdr } = buildMaterialise(context(USDC), { ephemeralTrusts: true })
    expect(types(xdr)).toEqual([
      'beginSponsoringFutureReserves',
      'createAccount',
      'endSponsoringFutureReserves',
    ])
  })

  // The recipient is deliberately absent — TX1 needs only sponsor and ephemeral,
  // which is what lets it be built the moment the claim page loads.
  it('names no recipient', () => {
    const { xdr } = buildMaterialise(context(USDC), { ephemeralTrusts: false })
    const sources = parse(xdr).operations.map((op) => op.source)
    expect(sources).not.toContain(recipient.publicKey())
  })

  it('creates the account with a zero starting balance — the sponsor covers it', () => {
    const tx = parse(buildMaterialise(context(Asset.native()), { ephemeralTrusts: false }).xdr)
    const create = tx.operations.find((op) => op.type === 'createAccount')
    expect(create).toMatchObject({ destination: ephemeral.publicKey() })
    // Compared as a number: the SDK normalises '0' to '0.0000000' on the XDR
    // round trip, and asserting the string would be testing its formatter.
    expect(new Decimal((create as { startingBalance: string }).startingBalance).isZero()).toBe(true)
  })
})

describe('TX2 — claim, forward, dispose', () => {
  const facts = (over: Partial<Parameters<typeof buildClaim>[1]> = {}) => ({
    ephemeralExists: true,
    ephemeralTrusts: false,
    recipientExists: true,
    recipientTrusts: true,
    ...over,
  })

  it('is claim, pay, merge for an existing recipient and a native asset', () => {
    const plan = buildClaim(context(Asset.native()), facts())
    expect(types(plan.xdr)).toEqual(['claimClaimableBalance', 'payment', 'accountMerge'])
  })

  it('creates the recipient account when it does not exist', () => {
    const plan = buildClaim(context(Asset.native()), facts({ recipientExists: false, recipientTrusts: false }))
    expect(types(plan.xdr)).toEqual([
      'claimClaimableBalance',
      'beginSponsoringFutureReserves',
      'createAccount',
      'endSponsoringFutureReserves',
      'payment',
      'accountMerge',
    ])
  })

  it('adds a recipient trustline when the asset is non-native and they lack one', () => {
    const plan = buildClaim(context(USDC), facts({ recipientTrusts: false }))
    expect(types(plan.xdr)).toEqual([
      'claimClaimableBalance',
      'beginSponsoringFutureReserves',
      'changeTrust',
      'endSponsoringFutureReserves',
      'payment',
      'changeTrust',
      'accountMerge',
    ])
  })

  /*
   * The rule that broke the original design. AccountMerge refuses an account
   * holding any subentry, and the sponsored trustline is one — so the
   * limit-0 ChangeTrust must come first. Asserted by INDEX, because "both
   * operations are present" would pass with them the wrong way round.
   */
  it('removes the ephemeral trustline BEFORE the merge', () => {
    const ops = types(buildClaim(context(USDC), facts()).xdr)
    const lastChangeTrust = ops.lastIndexOf('changeTrust')
    const merge = ops.indexOf('accountMerge')
    expect(lastChangeTrust).toBeGreaterThan(-1)
    expect(merge).toBeGreaterThan(lastChangeTrust)
    expect(merge).toBe(ops.length - 1)
  })

  it('zeroes the ephemeral trustline rather than merely touching it', () => {
    const tx = parse(buildClaim(context(USDC), facts()).xdr)
    const ephemeralTrust = tx.operations.filter(
      (op) => op.type === 'changeTrust' && op.source === ephemeral.publicKey(),
    )
    expect(ephemeralTrust).toHaveLength(1)
    expect(new Decimal((ephemeralTrust[0] as { limit: string }).limit).isZero()).toBe(true)
  })

  it('merges to the recipient, which returns the sponsored reserves', () => {
    const tx = parse(buildClaim(context(Asset.native()), facts()).xdr)
    const merge = tx.operations.find((op) => op.type === 'accountMerge')
    expect(merge).toMatchObject({ destination: recipient.publicKey(), source: ephemeral.publicKey() })
  })

  it('pays the exact amount to the recipient', () => {
    const tx = parse(buildClaim(context(Asset.native()), facts()).xdr)
    const payment = tx.operations.find((op) => op.type === 'payment')
    expect(payment).toMatchObject({ amount: '2.5000000', destination: recipient.publicKey() })
  })
})

/*
 * Signing when the recipient is not an operation source returns
 * tx_bad_auth_extra. The spike proved this by submitting an over-signed
 * transaction, asserting the code, then submitting the same transaction
 * correctly signed — so the rejection was the signature, not the operations.
 */
describe('the conditional recipient signature', () => {
  const facts = (over: Partial<Parameters<typeof buildClaim>[1]> = {}) => ({
    ephemeralExists: true,
    ephemeralTrusts: false,
    recipientExists: true,
    recipientTrusts: true,
    ...over,
  })

  it('is NOT required for an existing recipient holding the trustline', () => {
    expect(buildClaim(context(USDC), facts()).needsRecipientSignature).toBe(false)
    expect(buildClaim(context(Asset.native()), facts()).needsRecipientSignature).toBe(false)
  })

  it('IS required when the recipient account must be created', () => {
    const plan = buildClaim(context(Asset.native()), facts({ recipientExists: false }))
    expect(plan.needsRecipientSignature).toBe(true)
  })

  it('IS required when the recipient needs a trustline', () => {
    expect(buildClaim(context(USDC), facts({ recipientTrusts: false })).needsRecipientSignature).toBe(true)
  })

  // The flag must agree with the operations, or the client signs wrongly either way.
  it('is true exactly when the recipient sources an operation', () => {
    for (const f of [
      facts(),
      facts({ recipientExists: false, recipientTrusts: false }),
      facts({ recipientTrusts: false }),
    ]) {
      for (const asset of [Asset.native(), USDC]) {
        const plan = buildClaim(context(asset), f)
        const recipientSources = parse(plan.xdr).operations.some(
          (op) => op.source === recipient.publicKey(),
        )
        expect(plan.needsRecipientSignature).toBe(recipientSources)
      }
    }
  })
})

describe('sponsor signing', () => {
  it('adds exactly one signature, verifiable as the sponsor', () => {
    const { xdr } = buildMaterialise(context(Asset.native()), { ephemeralTrusts: false })
    const signed = parse(signAsSponsor(xdr, PASSPHRASE, sponsor.secret()))

    expect(signed.signatures).toHaveLength(1)
    expect(
      sponsor.verify(signed.hash(), signed.signatures[0]!.signature()),
    ).toBe(true)
  })

  it('leaves the operations untouched', () => {
    const { xdr } = buildClaim(context(USDC), {
      ephemeralExists: true,
      ephemeralTrusts: false,
      recipientExists: false,
      recipientTrusts: false,
    })
    expect(types(signAsSponsor(xdr, PASSPHRASE, sponsor.secret()))).toEqual(types(xdr))
  })

  it('refuses to sign a fee-bump envelope', () => {
    const { xdr } = buildMaterialise(context(Asset.native()), { ephemeralTrusts: false })
    const inner = parse(signAsSponsor(xdr, PASSPHRASE, sponsor.secret()))
    const bump = TransactionBuilder.buildFeeBumpTransaction(sponsor, '2000', inner, PASSPHRASE)
    expect(() => signAsSponsor(bump.toXDR(), PASSPHRASE, sponsor.secret())).toThrow(/fee-bump/)
  })
})
