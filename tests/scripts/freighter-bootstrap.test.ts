import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'
import { describe, expect, it } from 'vitest'
import { BOOTSTRAP_ASSET, bootstrapFeePerOperation, buildSponsoredSenderBootstrap, verifyBootstrapSignature } from '../../scripts/lib/freighter-bootstrap'

describe('Classic bootstrap fee bid', () => {
  it('uses the live ledger base fee, rather than treating a high charged-fee percentile as mandatory', () => {
    const observed = { last_ledger_base_fee: '100', fee_charged: { p95: '213369' } }
    expect(bootstrapFeePerOperation(observed.last_ledger_base_fee)).toBe('1000')
  })
  it('preserves the cap and remains above the current minimum when headroom reaches it', () => {
    expect(bootstrapFeePerOperation('200')).toBe('2000')
    expect(bootstrapFeePerOperation('2000')).toBe('10000')
    expect(bootstrapFeePerOperation('10000')).toBe('10000')
    expect(() => bootstrapFeePerOperation('10001')).toThrow('cap')
  })
  it.each(['0', '-100', '1.5', 'NaN', 'Infinity', '', '1e3'])('rejects malformed fee %j', (value) => {
    expect(() => bootstrapFeePerOperation(value)).toThrow('Invalid')
  })
})

describe('Freighter zero-XLM Testnet bootstrap envelope', () => {
  const sponsor = Keypair.random()
  const sender = Keypair.random()
  function prepared() {
    const tx = buildSponsoredSenderBootstrap(new Account(sponsor.publicKey(), '5'), sender.publicKey(), '100')
    tx.sign(sponsor)
    return tx
  }
  it('uses sponsored zero-balance creation and the official trustline without moving principal', () => {
    const tx = prepared()
    expect(tx.source).toBe(sponsor.publicKey())
    expect(tx.fee).toBe('400')
    expect(tx.operations.map((op) => op.type)).toEqual(['beginSponsoringFutureReserves', 'createAccount', 'changeTrust', 'endSponsoringFutureReserves'])
    expect(tx.operations[1]).toMatchObject({ destination: sender.publicKey(), startingBalance: '0.0000000' })
    expect(tx.operations[2]).toMatchObject({ source: sender.publicKey(), line: BOOTSTRAP_ASSET, limit: '100.0000000' })
    expect(tx.operations[3]).toMatchObject({ source: sender.publicKey() })
  })
  it('accepts the exact transaction signed by sponsor and sender', () => {
    const original = prepared()
    const signed = TransactionBuilder.fromXDR(original.toXDR(), Networks.TESTNET)
    signed.sign(sender)
    expect(verifyBootstrapSignature(original, signed.toXDR(), sender.publicKey()).hash()).toEqual(original.hash())
  })
  it('refuses missing, foreign, duplicate and wrong-network signatures', () => {
    const original = prepared()
    expect(() => verifyBootstrapSignature(original, original.toXDR(), sender.publicKey())).toThrow('exactly')
    for (const signer of [Keypair.random(), sponsor]) {
      const signed = TransactionBuilder.fromXDR(original.toXDR(), Networks.TESTNET)
      signed.sign(signer)
      expect(() => verifyBootstrapSignature(original, signed.toXDR(), sender.publicKey())).toThrow('signature')
    }
    const signedForPublic = TransactionBuilder.fromXDR(original.toXDR(), Networks.PUBLIC)
    signedForPublic.sign(sender)
    expect(() => verifyBootstrapSignature(original, signedForPublic.toXDR(), sender.publicKey())).toThrow('signature')
  })
  it('refuses altered issuer, destination and starting balance despite valid sender signatures', () => {
    const original = prepared()
    for (const op of [
      Operation.changeTrust({ asset: new Asset('USDC', Keypair.random().publicKey()), source: sender.publicKey() }),
      Operation.createAccount({ destination: Keypair.random().publicKey(), startingBalance: '0' }),
      Operation.createAccount({ destination: sender.publicKey(), startingBalance: '1' }),
    ]) {
      const changed = new TransactionBuilder(new Account(sponsor.publicKey(), '5'), { fee: '100', networkPassphrase: Networks.TESTNET }).addOperation(op).setTimeout(300).build()
      changed.sign(sponsor, sender)
      expect(() => verifyBootstrapSignature(original, changed.toXDR(), sender.publicKey())).toThrow('changed')
    }
  })
})
