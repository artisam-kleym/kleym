'use client'

/**
 * Wallet signing for envelopes the SENDER must approve. SPEC.md §8.
 *
 * Used by campaign creation (#8) and by reclaim (#13). It lives here rather
 * than beside the wizard because both flows hand the sender's own wallet an
 * unsigned envelope and get one back — the same operation, whatever the
 * transaction turns out to contain.
 *
 * Goes through `@creit.tech/stellar-wallets-kit` rather than Freighter's API
 * directly: the kit gives xBull, Albedo, Rabet, Lobstr and Hana for the same
 * work, and which wallet the sender uses is not Kleym's choice to make.
 *
 * The kit is v2, whose surface is entirely STATIC — `StellarWalletsKit.init`,
 * `.authModal`, `.signTransaction`. Earlier versions were instance-based with
 * `openModal`/`setWallet`/`getAddress`; that API no longer exists, and code
 * written from memory against it does not compile (AGENT.md §3.1).
 *
 * Imported lazily. The kit carries every wallet adapter it supports, and the
 * wizard's first two steps need none of them — nor does a sender who abandons
 * at step 1.
 */
type Network = 'testnet' | 'public'

let initialised = false

async function kit() {
  const sdk = await import('@creit.tech/stellar-wallets-kit')
  const { defaultModules } = await import('@creit.tech/stellar-wallets-kit/modules/utils')
  return { sdk, defaultModules }
}

async function ensureInitialised(network: Network, walletIds?: readonly string[]) {
  const { sdk, defaultModules } = await kit()

  const target = network === 'public' ? sdk.Networks.PUBLIC : sdk.Networks.TESTNET

  if (!initialised || walletIds) {
    const modules = walletIds
      ? defaultModules({ filterBy: (module) => walletIds.includes(module.productId) })
      : defaultModules()
    if (!modules.length) throw new Error('No supported wallet matches this connection request.')
    sdk.StellarWalletsKit.init({ modules, network: target })
    initialised = true
  } else {
    // A sender who backs up and switches network mid-wizard must not sign for
    // the one they started on.
    sdk.StellarWalletsKit.setNetwork(target)
  }

  return sdk
}

/** Opens the wallet chooser and returns the address the sender picked. */
export async function connectWallet(network: Network, options?: { walletIds: readonly string[] }): Promise<string> {
  const sdk = await ensureInitialised(network, options?.walletIds)
  const { address } = await sdk.StellarWalletsKit.authModal()
  return address
}

/**
 * Signs one envelope.
 *
 * Kleym holds no key that could sign this. The signed result is re-derived
 * against the campaign row server-side before submission
 * (lib/stellar/batch.ts) — a wallet can return a different transaction than
 * the one it was handed, and being the sender's own wallet does not change
 * that.
 */
export async function signEnvelope(
  xdr: string,
  network: Network,
  senderPublicKey: string,
): Promise<string> {
  const sdk = await ensureInitialised(network)

  const { signedTxXdr } = await sdk.StellarWalletsKit.signTransaction(xdr, {
    address: senderPublicKey,
    networkPassphrase:
      network === 'public' ? sdk.Networks.PUBLIC : sdk.Networks.TESTNET,
  })

  return signedTxXdr
}

/** Human-readable reason from whatever the wallet threw. */
export async function walletErrorMessage(error: unknown): Promise<string> {
  try {
    const { parseError } = await import('@creit.tech/stellar-wallets-kit')
    const parsed = parseError(error)
    return parsed.message ?? 'The wallet did not complete the request.'
  } catch {
    return error instanceof Error ? error.message : 'The wallet did not complete the request.'
  }
}
