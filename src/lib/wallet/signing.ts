'use client'

/** Campaign wallet routing: embedded Lantern, phone Freighter, desktop Freighter. */
type Network = 'testnet' | 'public'
import { connectLantern, lanternParentOrigin, signLantern } from './lantern'
import { FREIGHTER_APP_LINK, freighterPairingLink, openFreighterApp, phoneBrowserSnapshot } from './phone'

let mobileProjectId = ''
let senderTransport: 'desktop' | 'mobile' = 'desktop'
let mobileLink = ''
let connecting: AbortController | null = null
const mobileListeners = new Set<() => void>()
export function subscribeSenderMobile(notify: () => void) { mobileListeners.add(notify); return () => { mobileListeners.delete(notify) } }
export function senderMobileSnapshot() { return mobileLink }
function showMobileLink(link: string) { mobileLink = link; mobileListeners.forEach((notify) => notify()) }
export function cancelSenderConnection() { connecting?.abort() }
export function configureSenderMobile(projectId: string) { mobileProjectId = projectId }

async function adapter(network: Network) {
  const { FreighterDesktop, Networks } = await import('@/lib/wallet/desktop')
  const wallet = new FreighterDesktop()
  const passphrase = network === 'public' ? Networks.PUBLIC : Networks.TESTNET
  if (!(await wallet.isAvailable())) throw new Error('Open Freighter in this desktop browser, unlock it, then try again.')
  return { wallet, passphrase }
}

async function checkNetwork(wallet: Awaited<ReturnType<typeof adapter>>['wallet'], passphrase: string, network: Network) {
  if ((await wallet.getNetwork()).networkPassphrase !== passphrase) {
    throw new Error(`Switch Freighter to ${network === 'testnet' ? 'Testnet' : 'Mainnet'}, then try again.`)
  }
}

/** Connecting is an explicit access request, never a signature or submission. */
export async function connectWallet(network: Network, options?: { walletIds?: readonly string[]; reuseSession?: boolean }): Promise<string> {
  if (lanternParentOrigin()) return connectLantern(network)
  if (options?.walletIds && !options.walletIds.includes('freighter')) throw new Error('No supported wallet matches this connection request. This pilot uses Freighter.')
  if (phoneBrowserSnapshot()) {
    if (!/^[a-f0-9]{32}$/i.test(mobileProjectId)) throw new Error('Phone wallet connections are not configured. Open Kleym in Lantern or ask the sender to enable phone connections.')
    if (connecting) throw new Error('Finish or cancel the current phone connection first.')
    connecting = new AbortController()
    try {
      const { connectMobile, mobileAddress } = await import('./mobile')
      if (options?.reuseSession) {
        try { const address = mobileAddress(network); senderTransport = 'mobile'; return address } catch { /* Expired or absent: ask for a new pairing. */ }
      }
      const address = await connectMobile(network, { projectId: mobileProjectId }, (uri) => {
        const link = freighterPairingLink(uri); showMobileLink(link); openFreighterApp(link)
      }, connecting.signal)
      senderTransport = 'mobile'
      return address
    } finally { connecting = null; showMobileLink('') }
  }
  senderTransport = 'desktop'
  const { wallet, passphrase } = await adapter(network)
  const { address } = await wallet.getAddress({})
  await checkNetwork(wallet, passphrase, network)
  return address
}

/** Server verification still binds the exact envelope, signer and network. */
export async function signEnvelope(xdr: string, network: Network, senderPublicKey: string): Promise<string> {
  if (lanternParentOrigin()) return signLantern(xdr, network, senderPublicKey)
  if (senderTransport === 'mobile') {
    try {
      return await (await import('./mobile')).signMobile(xdr, network, senderPublicKey, () => { showMobileLink(FREIGHTER_APP_LINK); openFreighterApp(FREIGHTER_APP_LINK) })
    } finally { showMobileLink('') }
  }
  const { wallet, passphrase } = await adapter(network)
  await checkNetwork(wallet, passphrase, network)
  const { signedTxXdr, signerAddress } = await wallet.signTransaction(xdr, {
    address: senderPublicKey, networkPassphrase: passphrase,
  })
  if (!signedTxXdr) throw new Error('Freighter did not return a signed transaction.')
  if (signerAddress && signerAddress !== senderPublicKey) throw new Error('Freighter signed with a different account. Select the funding account and try again.')
  return signedTxXdr
}

/** Parse adapter errors without loading the modal and masking the original error. */
export async function walletErrorMessage(error: unknown): Promise<string> {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') return error.message
  return 'The wallet did not complete the request.'
}
