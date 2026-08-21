import { describe, expect, it } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { createCampaignSchema, serialiseAmount, stellarAmount } from '@/lib/api/campaigns'

const PUB = Keypair.random().publicKey()
const SEED = Keypair.random().secret()
const FUTURE = new Date(Date.now() + 7 * 86_400_000).toISOString()

const valid = {
  name: 'Q3 payout',
  network: 'testnet' as const,
  senderPublicKey: PUB,
  assetCode: 'XLM',
  amountPerLink: '0.3000000',
  linkCount: 3,
  expiresAt: FUTURE,
}

describe('stellarAmount', () => {
  /*
   * Money crosses the boundary as a string because a JSON number is an IEEE
   * double: 0.1 + 0.2 !== 0.3, and Stellar's seven places do not survive it.
   */
  it.each(['0.3000000', '1', '0.0000001', '1000000.1234567'])('accepts %s', (v) => {
    expect(stellarAmount.safeParse(v).success).toBe(true)
  })

  it.each([
    ['eight decimal places', '0.30000001'],
    ['exponent notation', '1e3'],
    ['negative', '-1'],
    ['zero', '0'],
    ['empty', ''],
  ])('rejects %s', (_label, v) => {
    expect(stellarAmount.safeParse(v).success).toBe(false)
  })

  it('rejects a JSON number, not just a bad string', () => {
    expect(stellarAmount.safeParse(0.3).success).toBe(false)
  })
})

describe('serialiseAmount', () => {
  it('round-trips without a float artefact', () => {
    // The canonical case: 0.1 + 0.2 in binary floating point is 0.30000000000000004.
    expect(serialiseAmount('0.3000000')).toBe('0.3')
    expect(serialiseAmount('0.1')).toBe('0.1')
    expect(serialiseAmount('1000000.1234567')).toBe('1000000.1234567')
  })
})

describe('createCampaignSchema', () => {
  it('accepts a well-formed campaign', () => {
    expect(createCampaignSchema.safeParse(valid).success).toBe(true)
  })

  it('REJECTS unknown keys rather than stripping them', () => {
    // Stripping would mean the value reached the server unexamined — which is
    // why the seed scanner runs before this schema, not after it.
    const result = createCampaignSchema.safeParse({ ...valid, surprise: 'hi' })
    expect(result.success).toBe(false)
  })

  it('rejects a secret seed in any string field', () => {
    expect(createCampaignSchema.safeParse({ ...valid, name: `payout ${SEED}` }).success).toBe(false)
    expect(createCampaignSchema.safeParse({ ...valid, senderPublicKey: SEED }).success).toBe(false)
  })

  it('requires an issuer for a non-native asset', () => {
    expect(createCampaignSchema.safeParse({ ...valid, assetCode: 'USDC' }).success).toBe(false)
    expect(
      createCampaignSchema.safeParse({ ...valid, assetCode: 'USDC', assetIssuer: PUB }).success,
    ).toBe(true)
  })

  it('refuses an issuer on the native asset', () => {
    expect(createCampaignSchema.safeParse({ ...valid, assetIssuer: PUB }).success).toBe(false)
  })

  it('refuses an expiry in the past', () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    expect(createCampaignSchema.safeParse({ ...valid, expiresAt: past }).success).toBe(false)
  })
})
