import { Networks } from '@stellar/stellar-sdk'

export const TESTNET_HORIZON = 'https://horizon-testnet.stellar.org'
export const TESTNET_FRIENDBOT = 'https://friendbot.stellar.org'

/** The live spike is intentionally narrower than application provider configuration. */
export function testnetProtocolSettings(horizon: string, friendbot: string, passphrase?: string): void {
  if (horizon !== TESTNET_HORIZON || friendbot !== TESTNET_FRIENDBOT ||
    (passphrase !== undefined && passphrase !== Networks.TESTNET)) {
    throw new Error('Live protocol verification requires the exact official Testnet providers and passphrase')
  }
}

export async function assertLiveTestnet(read: typeof fetch = fetch): Promise<void> {
  const response = await read(TESTNET_HORIZON, { redirect: 'error', signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error('Testnet provider unavailable')
  const root = await response.json() as { network_passphrase?: unknown }
  if (root.network_passphrase !== Networks.TESTNET) throw new Error('Testnet provider identity mismatch')
}
