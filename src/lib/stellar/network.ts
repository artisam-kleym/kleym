/** Public identities only. Circle directory verified 2026-09-29:
 * https://developers.circle.com/stablecoins/usdc-contract-addresses
 * Keep this registry authoritative on the server; consumers receive metadata.
 */
import { Networks } from '@stellar/stellar-sdk'

export type StellarNetwork = 'testnet' | 'public'

const NETWORKS = Object.freeze({
  testnet: Object.freeze({
    passphrase: Networks.TESTNET,
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    label: 'Stellar Testnet',
    valueNotice: 'Test USDC has no financial value and is not backed by real US dollars.',
  }),
  public: Object.freeze({
    passphrase: Networks.PUBLIC,
    issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    label: 'Stellar Public Network',
    valueNotice: 'Real USDC on the public Stellar network.',
  }),
})

export function stellarMetadata(network: StellarNetwork) {
  const identity = NETWORKS[network]
  return {
    network,
    networkPassphrase: identity.passphrase,
    networkLabel: identity.label,
    defaultAsset: { assetCode: 'USDC', assetIssuer: identity.issuer },
    nativeAsset: { assetCode: 'XLM', assetIssuer: null },
    isRealMoney: network === 'public',
    valueNotice: identity.valueNotice,
  }
}

export function isOfficialUsdc(network: StellarNetwork, asset: { assetCode: string; assetIssuer?: string | null }): boolean {
  return asset.assetCode === 'USDC' && asset.assetIssuer === NETWORKS[network].issuer
}

/** Static checks happen at first runtime configuration access, never at build. */
export function stellarConfigurationProblem(config: {
  STELLAR_NETWORK: StellarNetwork
  NETWORK_PASSPHRASE: string
  HORIZON_URL: string
  NODE_ENV: string
}): string | null {
  if (config.NETWORK_PASSPHRASE !== NETWORKS[config.STELLAR_NETWORK].passphrase) {
    return 'NETWORK_PASSPHRASE must match STELLAR_NETWORK'
  }
  let url: URL
  try { url = new URL(config.HORIZON_URL) } catch { return 'HORIZON_URL must be a valid URL' }
  if ((config.STELLAR_NETWORK === 'testnet' && url.hostname === 'horizon.stellar.org') ||
      (config.STELLAR_NETWORK === 'public' && url.hostname === 'horizon-testnet.stellar.org')) {
    return 'HORIZON_URL names the other Stellar network'
  }
  if (config.NODE_ENV === 'test' && config.STELLAR_NETWORK !== 'testnet') {
    return 'automated tests must use Stellar testnet'
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && config.NODE_ENV !== 'production' && config.STELLAR_NETWORK === 'testnet')) {
    return 'HORIZON_URL requires HTTPS outside a local testnet fixture'
  }
  return null
}
