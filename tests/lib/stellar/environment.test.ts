import { afterEach, expect, it, vi } from 'vitest'
import { Networks } from '@stellar/stellar-sdk'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
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
