import { describe, expect, it } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { parseReceiveAs } from '@/lib/campaign/receive-as'

const ISSUER = Keypair.random().publicKey()
const campaign = { assetCode: 'XLM', assetIssuer: '' }

describe('parseReceiveAs', () => {
  it('reads one asset per line, XLM or CODE:issuer', () => {
    expect(parseReceiveAs(`USDC:${ISSUER}\nEURC:${ISSUER}`, campaign)).toEqual({
      ok: true,
      assets: [{ assetCode: 'USDC', assetIssuer: ISSUER }, { assetCode: 'EURC', assetIssuer: ISSUER }],
    })
    expect(parseReceiveAs('XLM', { assetCode: 'USDC', assetIssuer: ISSUER })).toEqual({ ok: true, assets: [{ assetCode: 'XLM' }] })
    expect(parseReceiveAs('', campaign)).toEqual({ ok: true, assets: [] })
  })

  it('refuses a seed anywhere, naming the line', () => {
    expect(parseReceiveAs(`USDC:${ISSUER}\nUSDC:${Keypair.random().secret()}`, campaign)).toMatchObject({ ok: false, reason: 'seed', line: 2 })
  })

  it('refuses the campaign asset itself — that is no conversion, not an option', () => {
    expect(parseReceiveAs('XLM', campaign)).toMatchObject({ ok: false, reason: 'same' })
    expect(parseReceiveAs(`USDC:${ISSUER}`, { assetCode: 'USDC', assetIssuer: ISSUER })).toMatchObject({ ok: false, reason: 'same' })
  })

  it('refuses duplicates, bad issuers, bad formats and more than five', () => {
    expect(parseReceiveAs(`USDC:${ISSUER}\nUSDC:${ISSUER}`, campaign)).toMatchObject({ ok: false, reason: 'duplicate', line: 2 })
    expect(parseReceiveAs('USDC:notakey', campaign)).toMatchObject({ ok: false, reason: 'issuer' })
    expect(parseReceiveAs('USDC', campaign)).toMatchObject({ ok: false, reason: 'issuer' })
    // XLM takes no issuer: the server refuses it, so the wizard must too.
    expect(parseReceiveAs(`XLM:${ISSUER}`, { assetCode: 'USDC', assetIssuer: ISSUER })).toMatchObject({ ok: false, reason: 'format' })
    expect(parseReceiveAs(`TOOLONGASSETCODE:${ISSUER}`, campaign)).toMatchObject({ ok: false, reason: 'format' })
    const six = ['A', 'B', 'C', 'D', 'E', 'F'].map((c) => `${c}:${ISSUER}`).join('\n')
    expect(parseReceiveAs(six, campaign)).toMatchObject({ ok: false, reason: 'too-many' })
  })
})
