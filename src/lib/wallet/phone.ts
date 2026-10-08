/** Device routing affects connection UI only, never signing authorization. */
export function isPhoneBrowser(device: { userAgent: string; platform?: string; maxTouchPoints?: number }, inFreighterMobile = false): boolean {
  return inFreighterMobile || /Android|iPhone|iPad|iPod/i.test(device.userAgent)
    || (device.platform === 'MacIntel' && (device.maxTouchPoints ?? 0) > 1)
}

export function phoneBrowserSnapshot(): boolean {
  if (typeof window === 'undefined') return false
  const provider = (window as Window & { stellar?: { provider?: string; platform?: string } }).stellar
  return isPhoneBrowser(window.navigator, provider?.provider === 'freighter' && provider.platform === 'mobile')
}

export function subscribePhoneBrowser(onChange: () => void): () => void {
  window.addEventListener('pageshow', onChange)
  return () => window.removeEventListener('pageshow', onChange)
}

/**
 * Official WalletConnect listing, checked 2026-10-03; Freighter v1.25.28's
 * useWalletKitEventsManager decodes its `uri` query and starts pairing.
 * Only this session URI crosses to the wallet, never the private claim URL.
 */
export const FREIGHTER_APP_LINK = 'freighterwallet://wc-redirect'

export function freighterPairingLink(uri: string): string {
  const invalid = () => new Error('The phone connection code is invalid. Cancel and try connecting again.')
  if (!/^wc:[a-f0-9]{64}@2\?/i.test(uri)) throw invalid()
  const parsed = new URL(uri)
  const params = parsed.searchParams
  if (parsed.hash || params.get('relay-protocol') !== 'irn' || params.getAll('relay-protocol').length !== 1
    || params.getAll('symKey').length !== 1 || !/^[a-f0-9]{64}$/i.test(params.get('symKey') ?? '')) throw invalid()
  return `${FREIGHTER_APP_LINK}?uri=${encodeURIComponent(uri)}`
}
