import { expect, it } from 'vitest'
import { Horizon, Keypair, Networks } from '@stellar/stellar-sdk'
import { startTestnetNetworkFixture } from '../../fixtures/horizon-network'

it('permits only local testnet identity reads and rejects ledger writes', async () => {
  const originalUrl = process.env.HORIZON_URL
  const stop = await startTestnetNetworkFixture()
  try {
    const url = process.env.HORIZON_URL!
    expect(new URL(url).hostname).toBe('127.0.0.1')
    const root = await fetch(url)
    expect(await root.json()).toEqual({ network_passphrase: Networks.TESTNET })
    expect((await fetch(new URL('transactions', url), { method: 'POST', body: 'inert-fixture' })).status).toBe(404)
  } finally {
    await stop()
    process.env.HORIZON_URL = originalUrl
  }
})

it('returns SDK-compatible missing accounts only when requested, while refusing submissions', async () => {
  const originalUrl = process.env.HORIZON_URL
  const stop = await startTestnetNetworkFixture({ missingAccounts: true })
  try {
    const url = process.env.HORIZON_URL!
    const provider = new Horizon.Server(url, { allowHttp: true })
    await expect(provider.loadAccount(Keypair.random().publicKey())).rejects.toMatchObject({ response: { status: 404 } })
    expect((await fetch(new URL('transactions', url), { method: 'POST', body: 'inert-fixture' })).status).toBe(404)
  } finally {
    await stop()
    process.env.HORIZON_URL = originalUrl
  }
})
