import { describe, expect, it } from 'vitest'
import { Keypair, Networks, StrKey } from '@stellar/stellar-sdk'
import { isOfficialUsdc, stellarConfigurationProblem, stellarMetadata } from '@/lib/stellar/network'
import { createCampaignSchema } from '@/lib/api/campaigns'

const testnet = {
  STELLAR_NETWORK: 'testnet' as const,
  NETWORK_PASSPHRASE: Networks.TESTNET,
  HORIZON_URL: 'https://horizon-testnet.stellar.org',
  NODE_ENV: 'test',
}

describe('deployment and official asset identity', () => {
  it('has distinct, checksum-valid Circle identities and explicit test value', () => {
    const test = stellarMetadata('testnet')
    const live = stellarMetadata('public')
    expect(StrKey.isValidEd25519PublicKey(test.defaultAsset.assetIssuer)).toBe(true)
    expect(StrKey.isValidEd25519PublicKey(live.defaultAsset.assetIssuer)).toBe(true)
    expect(test.defaultAsset.assetIssuer).not.toBe(live.defaultAsset.assetIssuer)
    expect(test.networkPassphrase).toBe(Networks.TESTNET)
    expect(live.networkPassphrase).toBe(Networks.PUBLIC)
    expect(test.isRealMoney).toBe(false)
    expect(test.valueNotice).toContain('no financial value')
    expect(live.isRealMoney).toBe(true)
    expect(isOfficialUsdc('public', test.defaultAsset)).toBe(false)
    expect(isOfficialUsdc('testnet', { assetCode: 'USDC', assetIssuer: Keypair.random().publicKey() })).toBe(false)
  })

  it.each([
    { NETWORK_PASSPHRASE: Networks.PUBLIC },
    { HORIZON_URL: 'https://horizon.stellar.org' },
    { HORIZON_URL: 'http://untrusted.example' },
    { HORIZON_URL: 'not-a-url' },
  ])('refuses invalid deployment configuration %j', (override) => {
    expect(stellarConfigurationProblem({ ...testnet, ...override })).not.toBeNull()
  })

  it('allows isolated loopback fixtures, but refuses them for production/public and refuses automated public tests', () => {
    expect(stellarConfigurationProblem(testnet)).toBeNull()
    expect(stellarConfigurationProblem({ ...testnet, HORIZON_URL: 'http://127.0.0.1:1234' })).toBeNull()
    expect(stellarConfigurationProblem({ ...testnet, HORIZON_URL: 'http://127.0.0.1:1234', NODE_ENV: 'production' })).not.toBeNull()
    const live = { ...testnet, STELLAR_NETWORK: 'public' as const, NETWORK_PASSPHRASE: Networks.PUBLIC, HORIZON_URL: 'https://horizon.stellar.org' }
    expect(stellarConfigurationProblem(live)).not.toBeNull()
    expect(stellarConfigurationProblem({ ...live, NODE_ENV: 'production' })).toBeNull()
    expect(stellarConfigurationProblem({ ...live, NODE_ENV: 'production', HORIZON_URL: 'https://horizon-testnet.stellar.org' })).not.toBeNull()
  })

  it('rejects wrong-network and lookalike new USDC campaigns, retaining native/custom assets', () => {
    const terms = { name: 'pilot', network: 'testnet', senderPublicKey: Keypair.random().publicKey(), amountPerLink: '1', linkCount: 1, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), ...stellarMetadata('testnet').defaultAsset }
    expect(createCampaignSchema.safeParse(terms).success).toBe(true)
    expect(createCampaignSchema.safeParse({ ...terms, network: 'public', ...stellarMetadata('public').defaultAsset }).success).toBe(false)
    expect(createCampaignSchema.safeParse({ ...terms, assetIssuer: Keypair.random().publicKey() }).success).toBe(false)
    expect(createCampaignSchema.safeParse({ ...terms, assetCode: 'XLM', assetIssuer: undefined }).success).toBe(true)
    expect(createCampaignSchema.safeParse({ ...terms, assetCode: 'CUSTOM', assetIssuer: Keypair.random().publicKey() }).success).toBe(true)
  })
})
