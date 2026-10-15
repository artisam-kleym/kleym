import { describe, expect, it } from 'vitest'
import { Account, Asset, Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { buildBatchTransaction, verifyBatchTransaction } from '@/lib/stellar/batch'
import { buildClaim, type ClaimContext } from '@/lib/stellar/claim'

const sponsor = Keypair.random(), sender = Keypair.random(), recipient = Keypair.random(), leakedLink = Keypair.random()
const asset = new Asset('USDC', Keypair.random().publicKey())
const expiry = new Date('2027-01-01T00:00:00Z')
const parse = (xdr: string) => TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction
const context = (asset: Asset): ClaimContext => ({ sponsorAccount: new Account(sponsor.publicKey(), '100'), sponsorPublicKey: sponsor.publicKey(),
  ephemeralPublicKey: leakedLink.publicKey(), recipientPublicKey: recipient.publicKey(), walletBound: true, asset, amount: '20',
  balanceId: '00000000' + 'a'.repeat(64), networkPassphrase: Networks.TESTNET, baseFee: '1000' })

describe('ledger wallet binding', () => {
  it('funds the assigned wallet as claimant; the exported secret is not a claimant; sender retains expiry reclaim', () => {
    const links = [{ id: 'L1', ephemeralPublicKey: leakedLink.publicKey(), recipientPublicKey: recipient.publicKey(), amount: '20' }]
    const built = buildBatchTransaction({ senderAccount: new Account(sender.publicKey(), '100'), sponsorAccount: new Account(sponsor.publicKey(), '100'),
      senderPublicKey: sender.publicKey(), asset, amountPerLink: '5', expiresAt: expiry, links, networkPassphrase: Networks.TESTNET, baseFee: '1000', timeoutSeconds: 600 })
    const tx = parse(built.xdr)
    const op = tx.operations.find((op) => op.type === 'createClaimableBalance')!
    expect(op.type).toBe('createClaimableBalance')
    if (op.type !== 'createClaimableBalance') throw new Error('missing balance')
    expect(op.claimants.map((c) => c.destination)).toEqual([recipient.publicKey(), sender.publicKey()])
    expect(op.claimants.some((c) => c.destination === leakedLink.publicKey())).toBe(false)
    tx.sign(sender)
    const expected = { senderPublicKey: sender.publicKey(), sponsorPublicKey: sponsor.publicKey(), asset, amountPerLink: '5', expiresAt: expiry, links,
      networkPassphrase: Networks.TESTNET, baseFee: '1000' }
    expect(verifyBatchTransaction(tx.toXDR(), expected).ok).toBe(true)
    expect(verifyBatchTransaction(tx.toXDR(), { ...expected, links: [{ ...links[0]!, recipientPublicKey: leakedLink.publicKey() }] }).ok).toBe(false)
  })
  for (const native of [true, false]) for (const mode of ['new', 'no-trustline', 'trusted'] as const) {
    it(`${native ? 'XLM' : 'USDC'} / ${mode}: claims directly to assigned wallet, with no temporary account, forwarding or merge`, () => {
      const c = context(native ? Asset.native() : asset)
      const plan = buildClaim(c, { ephemeralExists: false, ephemeralTrusts: false, recipientExists: mode !== 'new', recipientTrusts: mode === 'trusted' })
      const tx = parse(plan.xdr)
      expect(plan.needsRecipientSignature).toBe(true)
      expect(tx.source).toBe(sponsor.publicKey())
      expect(tx.operations.at(-1)).toMatchObject({ type: 'claimClaimableBalance', source: recipient.publicKey(), balanceId: c.balanceId })
      expect(tx.operations.some((op) => ['payment', 'accountMerge', 'pathPaymentStrictSend'].includes(op.type))).toBe(false)
      expect(tx.operations.some((op) => op.source === leakedLink.publicKey())).toBe(false)
      expect(tx.operations.filter((op) => op.type === 'createAccount')).toHaveLength(mode === 'new' ? 1 : 0)
      expect(tx.operations.filter((op) => op.type === 'changeTrust')).toHaveLength(!native && mode !== 'trusted' ? 1 : 0)
      tx.sign(recipient, sponsor)
      expect(tx.signatures).toHaveLength(2)
      expect(tx.signatures.some((signature) => Keypair.fromPublicKey(recipient.publicKey()).verify(tx.hash(), signature.signature()))).toBe(true)
      expect(tx.signatures.some((signature) => Keypair.fromPublicKey(leakedLink.publicKey()).verify(tx.hash(), signature.signature()))).toBe(false)
    })
  }
})
