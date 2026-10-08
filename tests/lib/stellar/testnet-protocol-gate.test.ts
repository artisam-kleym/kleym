import { expect, it, vi } from 'vitest'
import { Networks } from '@stellar/stellar-sdk'
import { assertLiveTestnet, testnetProtocolSettings, TESTNET_FRIENDBOT, TESTNET_HORIZON } from '../../../scripts/lib/testnet-protocol-gate'

it('refuses public/custom/credential-bearing providers and conflicting passphrases before actions', () => {
  expect(() => testnetProtocolSettings(TESTNET_HORIZON, TESTNET_FRIENDBOT, Networks.TESTNET)).not.toThrow()
  for (const [horizon, friendbot, phrase] of [
    ['https://horizon.stellar.org', TESTNET_FRIENDBOT, Networks.TESTNET],
    [TESTNET_HORIZON, 'https://example.test', Networks.TESTNET],
    [`${TESTNET_HORIZON}/?token=inert`, TESTNET_FRIENDBOT, Networks.TESTNET],
    [TESTNET_HORIZON, TESTNET_FRIENDBOT, Networks.PUBLIC],
  ]) expect(() => testnetProtocolSettings(horizon!, friendbot!, phrase)).toThrow('Testnet')
})

it('requires an exact provider identity and refuses redirects/outages without a signing action', async () => {
  const read = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ network_passphrase: Networks.PUBLIC })))
  await expect(assertLiveTestnet(read)).rejects.toThrow('identity mismatch')
  expect(read).toHaveBeenCalledWith(TESTNET_HORIZON, expect.objectContaining({ redirect: 'error' }))
  read.mockResolvedValue(new Response('outage', { status: 503 }))
  await expect(assertLiveTestnet(read)).rejects.toThrow('unavailable')
  read.mockResolvedValue(new Response(JSON.stringify({ network_passphrase: Networks.TESTNET })))
  await expect(assertLiveTestnet(read)).resolves.toBeUndefined()
})
