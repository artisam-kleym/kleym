'use client'

/**
 * Wallet signing for batch envelopes. SPEC.md §8.
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

async function ensureInitialised(network: Network) {
  const { sdk, defaultModules } = await kit()

  const target = network === 'public' ? sdk.Networks.PUBLIC : sdk.Networks.TESTNET

  if (!initialised) {
    sdk.StellarWalletsKit.init({ modules: defaultModules(), network: target })
    initialised = true
  } else {
    // A sender who backs up and switches network mid-wizard must not sign for
    // the one they started on.
    sdk.StellarWalletsKit.setNetwork(target)
  }

  return sdk
}

/** Opens the wallet chooser and returns the address the sender picked. */
export async function connectWallet(network: Network): Promise<string> {
  const sdk = await ensureInitialised(network)
  const { address } = await sdk.StellarWalletsKit.authModal()
  return address
}

/**
 * Signs one batch envelope.
 *
 * Kleym holds no key that could sign this. The signed result is re-derived
 * against the campaign row server-side before submission
 * (lib/stellar/batch.ts) — a wallet can return a different transaction than
 * the one it was handed, and being the sender's own wallet does not change
 * that.
 */
export async function signBatch(
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
