import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Account, Asset, Keypair, Networks, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'

const mocked = vi.hoisted(() => ({ init: vi.fn(), connect: vi.fn(), request: vi.fn(), disconnect: vi.fn(), get: vi.fn(), on: vi.fn(), off: vi.fn() }))
vi.mock('client-only', () => ({}))
vi.mock('@walletconnect/sign-client', () => ({ default: { init: mocked.init } }))
const key = Keypair.random()
const sponsor = Keypair.random()
const config = { projectId: '0123456789abcdef0123456789abcdef' }
const approved = (network = 'testnet') => ({
  topic: 'fixture-topic', expiry: Math.floor(Date.now() / 1000) + 600,
  namespaces: { stellar: { accounts: [`stellar:${network}:${key.publicKey()}`], methods: ['stellar_signXDR'], events: [] } },
})
function transaction(network: string = Networks.TESTNET, amount = '1') {
  return new TransactionBuilder(new Account(sponsor.publicKey(), '1'), { fee: '100', networkPassphrase: network })
    .addOperation(Operation.payment({ destination: key.publicKey(), asset: Asset.native(), amount }))
    .setTimeout(60).build()
}
// Native payment is a deterministic signature fixture, never submitted.

describe('mobile sign-only boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('window', { location: { origin: 'https://kleym.example', href: 'https://kleym.example/claim#PRIVATE-LINK', hash: '#PRIVATE-LINK' } })
    mocked.init.mockResolvedValue({ connect: mocked.connect, request: mocked.request, disconnect: mocked.disconnect, session: { get: mocked.get }, on: mocked.on, off: mocked.off })
    mocked.connect.mockResolvedValue({ uri: 'wc:fixture@2', approval: async () => approved() })
    mocked.get.mockReturnValue(approved())
    mocked.disconnect.mockResolvedValue(undefined)
  })
  async function connected(network: 'public' | 'testnet' = 'testnet') {
    const mod = await import('@/lib/wallet/mobile')
    await mod.connectMobile(network, config, vi.fn(), new AbortController().signal)
    return mod
  }
  it('requests only the selected chain and signXDR; metadata never contains the private URL', async () => {
    const uri = vi.fn()
    const mod = await import('@/lib/wallet/mobile')
    expect(mocked.init).not.toHaveBeenCalled()
    expect(await mod.connectMobile('testnet', config, uri, new AbortController().signal)).toBe(key.publicKey())
    expect(mocked.init.mock.calls[0][0]).toMatchObject({ logger: 'silent', telemetryEnabled: false, metadata: { url: 'https://kleym.example', icons: [] } })
    expect(JSON.stringify(mocked.init.mock.calls[0][0])).not.toContain('PRIVATE-LINK')
    expect(mocked.connect).toHaveBeenCalledWith({ requiredNamespaces: { stellar: { chains: ['stellar:testnet'], methods: ['stellar_signXDR'], events: [] } } })
    expect(uri).toHaveBeenCalledWith('wc:fixture@2')
    expect(mocked.request).not.toHaveBeenCalled()
  })
  it.each(['wrong-chain', 'expired', 'missing-method', 'multiple-accounts', 'invalid-address'])('rejects %s approvals', async (kind) => {
    const session = approved(kind === 'wrong-chain' ? 'pubnet' : 'testnet')
    if (kind === 'expired') session.expiry = 0
    if (kind === 'missing-method') session.namespaces.stellar.methods = ['stellar_signAndSubmitXDR']
    if (kind === 'multiple-accounts') session.namespaces.stellar.accounts.push(`stellar:testnet:${sponsor.publicKey()}`)
    if (kind === 'invalid-address') session.namespaces.stellar.accounts = ['stellar:testnet:invalid']
    mocked.connect.mockResolvedValue({ approval: async () => session })
    await expect(connected()).rejects.toThrow()
    expect(mocked.request).not.toHaveBeenCalled()
  })
  it('binds Mainnet requests to pubnet and preserves the sponsor signature', async () => {
    mocked.connect.mockResolvedValue({ approval: async () => approved('pubnet') })
    mocked.get.mockReturnValue(approved('pubnet'))
    const mod = await connected('public')
    const tx = transaction(Networks.PUBLIC)
    tx.sign(sponsor)
    const xdr = tx.toXDR()
    tx.sign(key)
    mocked.request.mockResolvedValue({ signedXDR: tx.toXDR() })
    expect(await mod.signMobile(xdr, 'public', key.publicKey())).toBe(tx.toXDR())
    expect(mocked.request).toHaveBeenCalledWith({ topic: 'fixture-topic', chainId: 'stellar:pubnet', request: { method: 'stellar_signXDR', params: { xdr } } })
  })
  it('opens approval only after publishing the exact active request, once, and removes its listener', async () => {
    const mod = await connected()
    const tx = transaction(); tx.sign(sponsor)
    const xdr = tx.toXDR(); tx.sign(key)
    const launched = vi.fn()
    mocked.request.mockImplementation(async () => {
      expect(launched).not.toHaveBeenCalled()
      const sent = mocked.on.mock.calls.find(([event]) => event === 'session_request_sent')![1]
      const event = { topic: 'fixture-topic', chainId: 'stellar:testnet', request: { method: 'stellar_signXDR', params: { xdr } } }
      sent({ ...event, topic: 'other-topic' })
      sent({ ...event, chainId: 'stellar:pubnet' })
      sent({ ...event, request: { ...event.request, params: { xdr: 'other-body' } } })
      expect(launched).not.toHaveBeenCalled()
      sent(event); sent(event)
      expect(launched).toHaveBeenCalledTimes(1)
      return { signedXDR: tx.toXDR() }
    })
    await expect(mod.signMobile(xdr, 'testnet', key.publicKey(), launched)).resolves.toBe(tx.toXDR())
    expect(mocked.off).toHaveBeenCalledWith('session_request_sent', expect.any(Function))
  })
  it('cleans up approval launch after wallet rejection without submitting or reconnecting', async () => {
    const mod = await connected()
    mocked.request.mockRejectedValue(new Error('User rejected the request'))
    const launched = vi.fn()
    await expect(mod.signMobile(transaction().toXDR(), 'testnet', key.publicKey(), launched)).rejects.toThrow('User rejected')
    expect(launched).not.toHaveBeenCalled()
    expect(mocked.off).toHaveBeenCalledWith('session_request_sent', expect.any(Function))
    expect(mocked.connect).toHaveBeenCalledTimes(1)
  })
  it.each(['changed-body', 'wrong-key', 'wrong-network', 'removed-signature'])('rejects %s signing responses', async (kind) => {
    const mod = await connected()
    const tx = transaction(); tx.sign(sponsor)
    const xdr = tx.toXDR()
    const returned = kind === 'changed-body' ? transaction(Networks.TESTNET, '2') : TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction
    if (kind === 'removed-signature') returned.signatures.splice(0)
    if (kind === 'wrong-network') {
      const wrong = TransactionBuilder.fromXDR(xdr, Networks.PUBLIC) as Transaction
      wrong.sign(key); mocked.request.mockResolvedValue({ signedXDR: wrong.toXDR() })
    } else { returned.sign(kind === 'wrong-key' ? Keypair.random() : key); mocked.request.mockResolvedValue({ signedXDR: returned.toXDR() }) }
    await expect(mod.signMobile(xdr, 'testnet', key.publicKey())).rejects.toThrow()
  })
  it.each(['session_delete', 'session_expire', 'session_update', 'session_event'])('invalidates %s before signing', async (event) => {
    const mod = await connected()
    mocked.on.mock.calls.find(([name]) => name === event)![1]({ topic: 'fixture-topic' })
    await expect(mod.signMobile(transaction().toXDR(), 'testnet', key.publicKey())).rejects.toThrow('Reconnect')
    expect(mocked.request).not.toHaveBeenCalled()
  })
  it('refuses an account change during an outstanding signature', async () => {
    const mod = await connected()
    const tx = transaction(); const xdr = tx.toXDR(); tx.sign(key)
    mocked.request.mockImplementation(async () => {
      mocked.on.mock.calls.find(([name]) => name === 'session_update')![1]({ topic: 'fixture-topic' })
      return { signedXDR: tx.toXDR() }
    })
    await expect(mod.signMobile(xdr, 'testnet', key.publicKey())).rejects.toThrow('Reconnect')
  })
  it('disconnects a late approval after cancellation', async () => {
    let resolve!: (value: ReturnType<typeof approved>) => void
    mocked.connect.mockResolvedValue({ uri: 'wc:fixture@2', approval: () => new Promise((r) => { resolve = r }) })
    const mod = await import('@/lib/wallet/mobile')
    const abort = new AbortController()
    const result = mod.connectMobile('testnet', config, () => abort.abort(), abort.signal)
    await expect(result).rejects.toThrow('cancelled')
    resolve(approved()); await new Promise((r) => setTimeout(r, 0))
    expect(mocked.disconnect).toHaveBeenCalled()
    expect(() => mod.mobileAddress('testnet')).toThrow('Reconnect')
  })
  it('stores protocol state only in memory', async () => {
    const { memoryStorage } = await import('@/lib/wallet/mobile')
    const first = memoryStorage(); const other = memoryStorage()
    await first.setItem('session', { topic: 'fixture' })
    expect(await first.getKeys()).toEqual(['session'])
    expect(await other.getItem('session')).toBeUndefined()
    await first.removeItem('session')
    expect(await first.getEntries()).toEqual([])
  })
})
