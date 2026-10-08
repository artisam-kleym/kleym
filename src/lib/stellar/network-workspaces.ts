import type { StellarNetwork } from './network'
import { isPublicHostname } from '@/lib/validation/public-host'

export type NetworkWorkspaces = Record<StellarNetwork, string | null>

/** Cross-network navigation is operator configured, never supplied by a query or wallet. */
export function workspaceOrigin(raw: string): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || !isPublicHostname(url.hostname) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  } catch { return null }
}

export function networkWorkspaces(network: StellarNetwork, appUrl: string, testnetUrl: string, mainnetUrl: string): NetworkWorkspaces {
  const active = new URL(appUrl).origin
  const other = workspaceOrigin(network === 'testnet' ? mainnetUrl : testnetUrl)
  return network === 'testnet'
    ? { testnet: active, public: other === active ? null : other }
    : { testnet: other === active ? null : other, public: active }
}
