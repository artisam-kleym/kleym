'use client'

import 'client-only'
import { Keypair, Networks, StrKey, TransactionBuilder } from '@stellar/stellar-sdk'
import type SignClient from '@walletconnect/sign-client'

type Network = 'testnet' | 'public'
type Session = ReturnType<SignClient['session']['get']>
export interface MobileWalletConfig { projectId: string }
const chain = (network: Network) => `stellar:${network === 'public' ? 'pubnet' : 'testnet'}`
const passphrase = (network: Network) => network === 'public' ? Networks.PUBLIC : Networks.TESTNET

/** Wallet protocol state only. No localStorage, IndexedDB, link seed or recovery phrase. */
export function memoryStorage() {
  const values = new Map<string, unknown>()
  return {
    async getKeys() { return [...values.keys()] },
    async getEntries<T>() { return [...values.entries()] as [string, T][] },
    async getItem<T>(key: string) { return values.get(key) as T | undefined },
    async setItem<T>(key: string, value: T) { values.set(key, value) },
    async removeItem(key: string) { values.delete(key) },
  }
}

export function sessionAddress(session: Session, network: Network): string {
  const namespace = session.namespaces.stellar
  const prefix = `${chain(network)}:`
  const accounts = namespace?.accounts.filter((account) => account.startsWith(prefix)) ?? []
  if (session.expiry <= Math.floor(Date.now() / 1000) || !namespace?.methods.includes('stellar_signXDR') || accounts.length !== 1) {
    throw new Error(`Connect one Freighter account on ${network === 'testnet' ? 'Testnet' : 'Mainnet'} with transaction signing enabled.`)
  }
  const address = accounts[0].slice(prefix.length)
  if (!StrKey.isValidEd25519PublicKey(address)) throw new Error('The wallet returned an invalid account.')
  return address
}

/** An external wallet may add the requested signature, never change the reviewed body. */
export function verifyMobileSignature(xdr: string, signedXdr: string, network: Network, address: string): string {
  const before = TransactionBuilder.fromXDR(xdr, passphrase(network))
  const after = TransactionBuilder.fromXDR(signedXdr, passphrase(network))
  if (!before.hash().equals(after.hash())) throw new Error('The wallet changed the reviewed transaction. Reconnect and try again.')
  const key = Keypair.fromPublicKey(address)
  if (!after.signatures.some((signature) => key.verify(after.hash(), signature.signature()))) {
    throw new Error('The wallet did not sign with the selected account on the expected network.')
  }
  if (!before.signatures.every((signature) => after.signatures.some((other) => signature.toXDR().equals(other.toXDR())))) {
    throw new Error('The wallet removed a required transaction signature.')
  }
  return signedXdr
}

let clientPromise: Promise<SignClient> | undefined
let configuredProject: string | undefined
let active: { client: SignClient; topic: string; network: Network; address: string; valid: boolean } | undefined

async function clientFor(config: MobileWalletConfig) {
  if (!/^[a-f0-9]{32}$/i.test(config.projectId)) throw new Error('Mobile wallet connections are not configured.')
  if (configuredProject && configuredProject !== config.projectId) throw new Error('Reload the original claim link to reconnect.')
  if (!clientPromise) {
    configuredProject = config.projectId
    clientPromise = (async () => {
      const { default: Client } = await import('@walletconnect/sign-client')
      const client = await Client.init({
        projectId: config.projectId,
        relayUrl: 'wss://relay.walletconnect.org',
        logger: 'silent', telemetryEnabled: false, storage: memoryStorage(),
        // Never include pathname, query, fragment or any recipient/link key.
        metadata: { name: 'Kleym', description: 'Receive funds on Stellar', url: window.location.origin, icons: [] },
      })
      for (const event of ['session_delete', 'session_expire', 'session_update', 'session_event'] as const) {
        client.on(event, ({ topic }) => { if (active?.topic === topic) active.valid = false })
      }
      return client
    })().catch(() => {
      clientPromise = undefined
      configuredProject = undefined
      throw new Error('The mobile wallet connection could not start. Check your connection and try again.')
    })
  }
  return clientPromise
}

export function mobileAddress(network: Network): string {
  if (!active?.valid || active.network !== network) throw new Error('Reconnect your mobile wallet before claiming.')
  const address = sessionAddress(active.client.session.get(active.topic), network)
  if (address !== active.address) throw new Error('Your wallet account changed. Reconnect and review the destination.')
  return address
}

export async function disconnectMobile() {
  const previous = active
  active = undefined
  if (previous) await previous.client.disconnect({ topic: previous.topic, reason: { code: 6000, message: 'User disconnected' } }).catch(() => undefined)
}

export async function connectMobile(network: Network, config: MobileWalletConfig, onUri: (uri: string) => void, signal: AbortSignal): Promise<string> {
  await disconnectMobile()
  const client = await clientFor(config)
  if (signal.aborted) throw new Error('Wallet connection cancelled.')
  const { uri, approval } = await client.connect({ requiredNamespaces: {
    stellar: { chains: [chain(network)], methods: ['stellar_signXDR'], events: [] },
  } })
  // Observe late approvals after cancellation/timeout and disconnect them.
  let accepted = false
  const approved = approval()
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: (() => void) | undefined
  try {
    const session = await Promise.race([approved, new Promise<never>((_, reject) => {
      abort = () => reject(new Error('Wallet connection cancelled.'))
      signal.addEventListener('abort', abort, { once: true })
      timer = setTimeout(() => reject(new Error('Wallet connection timed out. Try connecting again.')), 120_000)
      if (signal.aborted) abort()
      else if (uri) onUri(uri)
    })])
    const address = sessionAddress(session, network)
    if (signal.aborted) throw new Error('Wallet connection cancelled.')
    active = { client, topic: session.topic, network, address, valid: true }
    accepted = true
    return address
  } finally {
    if (timer) clearTimeout(timer)
    if (abort) signal.removeEventListener('abort', abort)
    if (!accepted) {
      void approved.then((session) => client.disconnect({ topic: session.topic, reason: { code: 6000, message: 'Connection cancelled' } })).catch(() => undefined)
    }
  }
}

export async function signMobile(xdr: string, network: Network, address: string, onRequestSent?: () => void): Promise<string> {
  if (mobileAddress(network) !== address || !active) throw new Error('Reconnect and review the recipient account.')
  const current = active
  // Open the already paired wallet only after this exact request is published.
  // Never reuse the pairing URI or send the private claim URL to the wallet.
  let notified = false
  const onSent = (event: { topic: string; chainId: string; request: { method: string; params: unknown } }) => {
    const params = event.request.params as { xdr?: string } | undefined
    if (!notified && active === current && current.valid && event.topic === current.topic && event.chainId === chain(network)
      && event.request.method === 'stellar_signXDR' && params?.xdr === xdr) {
      notified = true
      onRequestSent?.()
    }
  }
  if (onRequestSent) current.client.on('session_request_sent', onSent)
  let result: { signedXDR: string }
  try {
    result = await current.client.request<{ signedXDR: string }>({
      topic: current.topic, chainId: chain(network),
      request: { method: 'stellar_signXDR', params: { xdr } },
    })
  } finally {
    if (onRequestSent) current.client.off('session_request_sent', onSent)
  }
  if (active !== current || mobileAddress(network) !== address) throw new Error('The wallet session changed. Reconnect before claiming.')
  if (!result?.signedXDR) throw new Error('Freighter did not return a signed transaction.')
  return verifyMobileSignature(xdr, result.signedXDR, network, address)
}
