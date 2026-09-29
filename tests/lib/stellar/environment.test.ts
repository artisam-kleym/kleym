import { afterEach, expect, it, vi } from 'vitest'
import { Networks } from '@stellar/stellar-sdk'
import { stellarMetadata } from '@/lib/stellar/network'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

it.each(['testnet', 'public'] as const)('defaults the accounting anchor to the selected %s network', async (network) => {
  vi.resetModules()
  vi.stubEnv('RATE_ANCHORS', undefined)
  vi.stubEnv('STELLAR_NETWORK', network)
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NETWORK_PASSPHRASE', network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC)
  vi.stubEnv('HORIZON_URL', network === 'testnet' ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org')
  const { env } = await import('@/lib/config/env')
  expect(env.RATE_ANCHORS).toBe(`USD=USDC:${stellarMetadata(network).defaultAsset.assetIssuer}`)
})

it('preserves an explicit accounting anchor override', async () => {
  vi.resetModules()
  vi.stubEnv('RATE_ANCHORS', 'EUR=EURC:custom-anchor')
  const { env } = await import('@/lib/config/env')
  expect(env.RATE_ANCHORS).toBe('EUR=EURC:custom-anchor')
})

it.each([
  ['wrong signing passphrase', { NETWORK_PASSPHRASE: Networks.PUBLIC }],
  ['public provider in testnet', { HORIZON_URL: 'https://horizon.stellar.org' }],
  ['malformed provider URL', { HORIZON_URL: 'malformed' }],
])('fails runtime configuration before exposing keys: %s', async (_label, overrides) => {
  vi.resetModules()
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value)
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('ENVIRONMENT_REFUSED') })
  const { env } = await import('@/lib/config/env')
  expect(() => env.STELLAR_NETWORK).toThrow('ENVIRONMENT_REFUSED')
  expect(errors).toHaveBeenCalledOnce()
  expect(String(errors.mock.calls[0]![0])).not.toContain(process.env.SPONSOR_SECRET_KEY)
})
