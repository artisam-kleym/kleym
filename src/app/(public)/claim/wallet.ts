'use client'

import 'client-only'
import { connectLantern, lanternParentOrigin, signLantern } from '@/lib/wallet/lantern'

/** Separate claim dependency boundary: no modal or key storage. */
type Network = 'testnet' | 'public'
let transport: 'desktop' | 'mobile' = 'desktop'

export async function connectMobileWallet(network: Network, config: import('@/lib/wallet/mobile').MobileWalletConfig, onUri: (uri: string) => void, signal: AbortSignal) {
  const { connectMobile } = await import('@/lib/wallet/mobile')
  const address = await connectMobile(network, config, onUri, signal)
  transport = 'mobile'
  return address
}

export async function selectDesktopWallet() {
  transport = 'desktop'
  const { disconnectMobile } = await import('@/lib/wallet/mobile')
  await disconnectMobile()
}

async function adapter(network: Network) {
  const { FreighterModule } = await import('@creit.tech/stellar-wallets-kit/modules/freighter')
  const { Networks } = await import('@creit.tech/stellar-wallets-kit/types')
  const wallet = new FreighterModule()
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
export async function connectWallet(network: Network): Promise<string> {
  if (lanternParentOrigin()) return connectLantern(network)
  if (transport === 'mobile') return (await import('@/lib/wallet/mobile')).mobileAddress(network)
  const { wallet, passphrase } = await adapter(network)
  const { address } = await wallet.getAddress({})
  await checkNetwork(wallet, passphrase, network)
  return address
}

/** Server verification still binds the exact envelope, signer and network. */
export async function signBatch(xdr: string, network: Network, recipientPublicKey: string, onMobileRequestSent?: () => void): Promise<string> {
  if (lanternParentOrigin()) return signLantern(xdr, network, recipientPublicKey)
  if (transport === 'mobile') return (await import('@/lib/wallet/mobile')).signMobile(xdr, network, recipientPublicKey, onMobileRequestSent)
  const { wallet, passphrase } = await adapter(network)
  await checkNetwork(wallet, passphrase, network)
  const { signedTxXdr, signerAddress } = await wallet.signTransaction(xdr, {
    address: recipientPublicKey, networkPassphrase: passphrase,
  })
  if (!signedTxXdr) throw new Error('Freighter did not return a signed transaction.')
  if (signerAddress && signerAddress !== recipientPublicKey) throw new Error('Freighter signed with a different account. Select the recipient account and try again.')
  return signedTxXdr
}

/** Parse adapter errors without loading the modal and masking the original error. */
export async function walletErrorMessage(error: unknown): Promise<string> {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') return error.message
  return 'The wallet did not complete the request.'
}
