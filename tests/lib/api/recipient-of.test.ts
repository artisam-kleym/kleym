import { describe, expect, it } from 'vitest'
import { Account, Asset, Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { buildClaim, type ClaimContext } from '@/lib/stellar/claim'
import { memoOf } from '@/lib/stellar/memo'
import { recipientOf } from '@/lib/api/claims'

/*
 * #75, acceptance criterion 4. `claimedBy` is the PAYMENT destination, read
 * off the envelope, and the memo is read beside it — for the wallet path, the
 * receive-as conversion path (#74) and the exchange path. Getting this wrong
 * silently records the sponsor as every exchange recipient, since that is
 * where the merge now goes.
 */
const sponsor = Keypair.random()
const ephemeral = Keypair.random()
const recipient = Keypair.random()
const USDC = new Asset('USDC', Keypair.random().publicKey())
const facts = { ephemeralExists: true, ephemeralTrusts: false, recipientExists: true, recipientTrusts: true }

const context = (over: Partial<ClaimContext> = {}): ClaimContext => ({
  sponsorAccount: new Account(sponsor.publicKey(), '100'),
  sponsorPublicKey: sponsor.publicKey(),
  ephemeralPublicKey: ephemeral.publicKey(),
  recipientPublicKey: recipient.publicKey(),
  asset: Asset.native(),
  amount: '2.5000000',
  balanceId: `00000000${'a'.repeat(64)}`,
  networkPassphrase: Networks.TESTNET,
  baseFee: '1000',
  ...over,
})
const parse = (xdr: string) => TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction

describe('recipientOf', () => {
  it('wallet path: the payment destination, and no memo', () => {
    const tx = parse(buildClaim(context(), facts).xdr)
    expect(recipientOf(tx)).toBe(recipient.publicKey())
    expect(memoOf(tx.memo)).toBeNull()
  })

  it('conversion path (#74): the path payment destination', () => {
    const tx = parse(buildClaim(context({ conversion: { destAsset: USDC, destMin: '2.4000000', path: [] } }), facts).xdr)
    expect(recipientOf(tx)).toBe(recipient.publicKey())
  })

  it('exchange path: the payment destination — NOT the sponsor the merge goes to — with the memo beside it', () => {
    const tx = parse(buildClaim(context({ memo: { type: 'id', value: '31337' } }), facts).xdr)
    const merge = tx.operations.find((op) => op.type === 'accountMerge') as { destination: string }
    expect(merge.destination).toBe(sponsor.publicKey())
    expect(recipientOf(tx)).toBe(recipient.publicKey())
    expect(recipientOf(tx)).not.toBe(sponsor.publicKey())
    expect(memoOf(tx.memo)).toEqual({ type: 'id', value: '31337' })
  })

  it('exchange path with conversion: still the payment destination and the memo', () => {
    const tx = parse(
      buildClaim(context({ memo: { type: 'text', value: 'acct-9' }, conversion: { destAsset: USDC, destMin: '2.4000000', path: [] } }), facts).xdr,
    )
    expect(recipientOf(tx)).toBe(recipient.publicKey())
    expect(memoOf(tx.memo)).toEqual({ type: 'text', value: 'acct-9' })
  })
})
