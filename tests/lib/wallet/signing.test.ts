import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isAvailable: vi.fn(async () => true),
  getAddress: vi.fn(async () => ({ address: 'public-account' })),
  getNetwork: vi.fn(async () => ({ networkPassphrase: 'Test SDF Network ; September 2015' })),
  signTransaction: vi.fn(async () => ({ signedTxXdr: 'signed-envelope', signerAddress: 'public-account' })),
}))
vi.mock('client-only', () => ({}))

vi.mock('@/lib/wallet/desktop', () => ({
  Networks: { PUBLIC: 'Public Global Stellar Network ; September 2015', TESTNET: 'Test SDF Network ; September 2015' },
  FreighterDesktop: class {
    isAvailable = mocks.isAvailable
    getAddress = mocks.getAddress
    getNetwork = mocks.getNetwork
    signTransaction = mocks.signTransaction
  },
}))

for (const kind of ['sender', 'recipient'] as const) {
  const load = async () => {
    if (kind === 'sender') {
      const mod = await import('@/lib/wallet/signing')
      return { ...mod, sign: mod.signEnvelope }
    }
    const mod = await import('../../../src/app/(public)/claim/wallet')
    return { ...mod, sign: mod.signBatch }
  }
  describe(`${kind} desktop Freighter boundary`, () => {
    beforeEach(() => {
      vi.resetModules()
      vi.clearAllMocks()
      mocks.isAvailable.mockResolvedValue(true)
      mocks.getNetwork.mockResolvedValue({ networkPassphrase: 'Test SDF Network ; September 2015' })
      mocks.signTransaction.mockResolvedValue({ signedTxXdr: 'signed-envelope', signerAddress: 'public-account' })
    })
    it('connects without importing the modal or requesting a signature', async () => {
      const mod = await load()
      expect(await mod.connectWallet('testnet')).toBe('public-account')
      expect(mocks.getAddress).toHaveBeenCalledWith({})
      expect(mocks.signTransaction).not.toHaveBeenCalled()
    })
    it('passes the exact envelope, requested account and network to the adapter', async () => {
      const mod = await load()
      expect(await mod.sign('reviewed-envelope', 'testnet', 'public-account')).toBe('signed-envelope')
      expect(mocks.signTransaction).toHaveBeenCalledWith('reviewed-envelope', {
        address: 'public-account', networkPassphrase: 'Test SDF Network ; September 2015',
      })
    })
    it('blocks wrong-network signing before asking for a signature', async () => {
      mocks.getNetwork.mockResolvedValue({ networkPassphrase: 'Public Global Stellar Network ; September 2015' })
      const mod = await load()
      await expect(mod.sign('reviewed-envelope', 'testnet', 'public-account')).rejects.toThrow('Switch Freighter to Testnet')
      expect(mocks.signTransaction).not.toHaveBeenCalled()
    })
    it('binds public-network signatures to the public passphrase', async () => {
      mocks.getNetwork.mockResolvedValue({ networkPassphrase: 'Public Global Stellar Network ; September 2015' })
      const mod = await load()
      await mod.sign('reviewed-envelope', 'public', 'public-account')
      expect(mocks.signTransaction).toHaveBeenCalledWith('reviewed-envelope', {
        address: 'public-account', networkPassphrase: 'Public Global Stellar Network ; September 2015',
      })
    })
    it('explains missing extensions without CSS injection', async () => {
      mocks.isAvailable.mockResolvedValue(false)
      const mod = await load()
      await expect(mod.connectWallet('testnet')).rejects.toThrow('Open Freighter')
      expect(mocks.getAddress).not.toHaveBeenCalled()
    })
    it('refuses an empty signed envelope', async () => {
      mocks.signTransaction.mockResolvedValue({ signedTxXdr: '', signerAddress: 'public-account' })
      const mod = await load()
      await expect(mod.sign('reviewed-envelope', 'testnet', 'public-account')).rejects.toThrow('did not return')
    })
    it('refuses a different returned signer', async () => {
      mocks.signTransaction.mockResolvedValue({ signedTxXdr: 'signed-envelope', signerAddress: 'wrong-account' })
      const mod = await load()
      await expect(mod.sign('reviewed-envelope', 'testnet', 'public-account')).rejects.toThrow('different account')
    })
    it('preserves adapter cancellation errors without importing the modal', async () => {
      const mod = await load()
      expect(await mod.walletErrorMessage({ message: 'User declined' })).toBe('User declined')
    })
  })
}
it('refuses unsupported explicitly selected wallets', async () => {
  const { connectWallet } = await import('@/lib/wallet/signing')
  await expect(connectWallet('testnet', { walletIds: ['unknown'] })).rejects.toThrow('No supported wallet')
})
