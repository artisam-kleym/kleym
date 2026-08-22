'use client'

/**
 * Wallet access for the claim page. SPEC.md §8.
 *
 * Deliberately separate from the wizard's signing module rather than a shared
 * import. `/claim` is the hardened route (AGENT.md §5.2), and sharing a module
 * with the sender-side wizard means any dependency the wizard later pulls in
 * arrives here too. The wallet kit is loaded LAZILY for the same reason: a
 * recipient who never taps "Connect wallet" never fetches a wallet adapter.
 */
import 'client-only'

type Network = 'testnet' | 'public'

let initialised = false

async function ensureInitialised(network: Network) {
  const sdk = await import('@creit.tech/stellar-wallets-kit')
  const { defaultModules } = await import('@creit.tech/stellar-wallets-kit/modules/utils')

  const target = network === 'public' ? sdk.Networks.PUBLIC : sdk.Networks.TESTNET

  if (!initialised) {
    sdk.StellarWalletsKit.init({ modules: defaultModules(), network: target })
    initialised = true
  } else {
    sdk.StellarWalletsKit.setNetwork(target)
  }

  return sdk
}

/** Opens the chooser and returns the address the recipient picked. */
export async function connectWallet(network: Network): Promise<string> {
  const sdk = await ensureInitialised(network)
  const { address } = await sdk.StellarWalletsKit.authModal()
  return address
}

/** Adds the RECIPIENT's signature, when they are an operation source. */
export async function signBatch(
  xdr: string,
  network: Network,
  recipientPublicKey: string,
): Promise<string> {
  const sdk = await ensureInitialised(network)
  const { signedTxXdr } = await sdk.StellarWalletsKit.signTransaction(xdr, {
    address: recipientPublicKey,
    networkPassphrase: network === 'public' ? sdk.Networks.PUBLIC : sdk.Networks.TESTNET,
  })
  return signedTxXdr
}

/**
 * A message a recipient can act on.
 *
 * Never the raw error: a wallet's rejection text is aimed at developers, and
 * this page's audience did not choose to be here (BRAND.md §8).
 */
export async function walletErrorMessage(error: unknown): Promise<string> {
  try {
    const { parseError } = await import('@creit.tech/stellar-wallets-kit')
    const parsed = parseError(error)
    if (parsed.message) return parsed.message
  } catch {
    /* fall through to the generic message */
  }
  return error instanceof Error ? error.message : 'The wallet did not complete the request.'
}
