import { describe, expect, it } from 'vitest'
import { Asset, Keypair } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { assetFields, assetRef, boundDestMin, parseAssetRef } from '@/lib/stellar/receive-as'

const ISSUER = Keypair.random().publicKey()

describe('asset refs', () => {
  it('round-trips native and issued assets', () => {
    expect(assetRef(Asset.native())).toBe('XLM')
    expect(parseAssetRef('XLM')!.isNative()).toBe(true)
    const usdc = new Asset('USDC', ISSUER)
    expect(assetRef(usdc)).toBe(`USDC:${ISSUER}`)
    expect(parseAssetRef(`USDC:${ISSUER}`)!.equals(usdc)).toBe(true)
  })

  it.each([
    ['no issuer', 'USDC'],
    ['a bad issuer', 'USDC:GNOTAKEY'],
    ['a secret seed as issuer', `USDC:${Keypair.random().secret()}`],
    ['too long a code', `ABCDEFGHIJKLM:${ISSUER}`],
    ['extra fields', `USDC:${ISSUER}:x`],
    ['empty', ''],
  ])('refuses %s', (_label, ref) => {
    expect(parseAssetRef(ref)).toBeNull()
  })

  it('exposes the wire fields the claim page renders', () => {
    expect(assetFields(Asset.native())).toEqual({ assetCode: 'XLM', assetIssuer: null })
    expect(assetFields(new Asset('EURC', ISSUER))).toEqual({ assetCode: 'EURC', assetIssuer: ISSUER })
  })
})

/*
 * `destMin` is the whole risk control: below it the path payment FAILS, which
 * leaves the balance claimable. It is the quote less the tolerance, rounded
 * down, and never zero.
 */
describe('boundDestMin', () => {
  it('takes one percent off and rounds DOWN to seven places', () => {
    expect(boundDestMin('100')).toBe('99.0000000')
    expect(boundDestMin('2.5000000')).toBe('2.4750000')
    // 0.0000003 × 0.99 = 0.000000297 → floors to 0.0000002, not rounds to 0.0000003.
    expect(boundDestMin('0.0000003')).toBe('0.0000002')
  })

  it('is never zero — a zero bound is no bound', () => {
    expect(boundDestMin('0.0000001')).toBe('0.0000001')
    expect(new Decimal(boundDestMin('0.0000001')).greaterThan(0)).toBe(true)
  })

  it('is Decimal arithmetic, not floating point', () => {
    expect(boundDestMin('0.3')).toBe('0.2970000')
    // 0.29 × 0.99 in binary floating point is 0.28709999999999997.
    expect(boundDestMin('0.29')).toBe('0.2871000')
    expect(0.29 * 0.99).not.toBe(0.2871)
  })
})
