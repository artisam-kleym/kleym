'use client'

import { Keypair, Networks, StrKey, TransactionBuilder } from '@stellar/stellar-sdk'
import { parseLanternOrigins } from './lantern-config'

type Network = 'testnet' | 'public'
let origins: string[] = []
const listeners = new Set<() => void>()
export function configureLantern(values: readonly string[]) { origins = parseLanternOrigins(values.join(',')); listeners.forEach((notify) => notify()) }
export function subscribeLantern(notify: () => void) { listeners.add(notify); return () => { listeners.delete(notify) } }
export function lanternSnapshot() { return !!lanternParentOrigin() }

export function lanternParentOrigin(): string | null {
  if (typeof window === 'undefined' || window.self === window.top) return null
  const ancestors = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins
  let parent = ancestors?.[0]
  if (!parent) { try { parent = new URL(document.referrer).origin } catch { return null } }
  return origins.includes(parent) ? parent : null
}

let pending = false
let stale = false
type Reply = Record<string, unknown>
/** The 0.6.2 bridge has no connect correlation id: one request may run at a time. */
function request<T>(message: Reply, result: (reply: Reply) => T | undefined, ack?: string): Promise<T> {
  const target = lanternParentOrigin()
  if (!target) return Promise.reject(new Error('Open Kleym inside the configured Lantern app.'))
  if (stale) return Promise.reject(new Error('Reopen Kleym after the previous Lantern request was interrupted or timed out. Keep your private export safe.'))
  if (pending) return Promise.reject(new Error('Finish the current Lantern request first.'))
  pending = true
  return new Promise((resolve, reject) => {
    let ackTimer: ReturnType<typeof setTimeout> | undefined
    const finish = (error?: Error, value?: T) => {
      pending = false
      clearTimeout(timer); clearTimeout(ackTimer)
      window.removeEventListener('message', receive)
      window.removeEventListener('pagehide', leave)
      if (error) reject(error); else resolve(value as T)
    }
    const leave = () => {
      // A restored page must not let an old idless connection approval finish
      // a new request. Retire the bridge just as on an unanswered timeout.
      stale = true
      finish(new Error('Lantern request interrupted. Reopen Kleym before retrying. Keep your private export safe.'))
    }
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== target || !event.data || typeof event.data !== 'object') return
      const reply = event.data as Reply
      if (message.id && reply.id !== message.id) return
      if (reply.type === ack) { clearTimeout(ackTimer); return }
      if (['lantern:connectRejected', 'lantern:signRejected', 'lantern:txError'].includes(String(reply.type))) {
        // Fixed categories keep arbitrary wallet/parent text out of UI or logs.
        finish(new Error(reply.type === 'lantern:txError' ? 'Lantern could not sign. Reconnect your wallet and review the transaction again.' : 'The request was declined in Lantern.'))
        return
      }
      try { const value = result(reply); if (value !== undefined) finish(undefined, value) }
      catch { finish(new Error('Lantern returned a different account, network or invalid response. Reconnect and try again.')) }
    }
    window.addEventListener('message', receive)
    window.addEventListener('pagehide', leave, { once: true })
    const timer = setTimeout(() => { stale = true; finish(new Error('Lantern did not answer in time. Reopen Kleym before retrying.')) }, 180_000)
    if (ack) ackTimer = setTimeout(() => { stale = true; finish(new Error('This Lantern version did not acknowledge transaction signing. Update Lantern and reopen Kleym.')) }, 5_000)
    try { window.parent.postMessage(message, target) }
    catch { finish(new Error('Lantern connection unavailable. Reopen Kleym in Apps.')) }
  })
}

export function connectLantern(network: Network): Promise<string> {
  return request({ type: 'lantern:getPublicKey' }, (reply) => {
    if (reply.type !== 'lantern:publicKey') return undefined
    if (reply.network !== (network === 'public' ? 'PUBLIC' : 'TESTNET') || typeof reply.publicKey !== 'string' || !StrKey.isValidEd25519PublicKey(reply.publicKey)) throw new Error('Invalid connection')
    return reply.publicKey
  })
}

/** Verify exact reviewed bytes, selected signature and existing sponsor/local signatures. */
export function verifyLanternSignature(xdr: string, signedXdr: string, network: Network, address: string): string {
  const passphrase = network === 'public' ? Networks.PUBLIC : Networks.TESTNET
  try {
    const before = TransactionBuilder.fromXDR(xdr, passphrase)
    const after = TransactionBuilder.fromXDR(signedXdr, passphrase)
    const key = Keypair.fromPublicKey(address)
    if (!before.hash().equals(after.hash()) || !after.signatures.some((s) => key.verify(after.hash(), s.signature())) || !before.signatures.every((s) => after.signatures.some((a) => s.toXDR().equals(a.toXDR())))) throw new Error('Invalid signature')
    return signedXdr
  } catch { throw new Error('Lantern did not preserve the reviewed transaction and required signatures. Nothing has been submitted by Kleym.') }
}

export async function signLantern(xdr: string, network: Network, address: string): Promise<string> {
  // Fresh access query catches wallet/network changes and renews a dropped Apps grant.
  if (await connectLantern(network) !== address) throw new Error('Select the account you reviewed in Lantern, then reconnect.')
  const signed = await request({ type: 'lantern:signXdr', id: crypto.randomUUID(), xdr, networkPassphrase: network === 'public' ? Networks.PUBLIC : Networks.TESTNET }, (reply) => {
    if (reply.type !== 'lantern:xdrSigned') return undefined
    if (typeof reply.signedXdr !== 'string' || !reply.signedXdr) throw new Error('Empty signature')
    return reply.signedXdr
  }, 'lantern:signing')
  return verifyLanternSignature(xdr, signed, network, address)
}
