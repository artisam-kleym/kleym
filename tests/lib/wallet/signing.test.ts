import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const modules = [{ productId: 'freighter' }, { productId: 'other' }]
  return {
    modules,
    init: vi.fn(),
    setNetwork: vi.fn(),
    authModal: vi.fn(async () => ({ address: 'public-sender' })),
    signTransaction: vi.fn(async () => ({ signedTxXdr: 'signed-envelope' })),
    defaultModules: vi.fn((options?: { filterBy: (module: { productId: string }) => boolean }) =>
      options?.filterBy ? modules.filter(options.filterBy) : modules),
  }
})
vi.mock('@creit.tech/stellar-wallets-kit', () => ({
  Networks: { TESTNET: 'Test SDF Network ; September 2015', PUBLIC: 'Public Global Stellar Network ; September 2015' },
  StellarWalletsKit: mocks,
}))
vi.mock('@creit.tech/stellar-wallets-kit/modules/utils', () => ({ defaultModules: mocks.defaultModules }))

describe('wallet connection selection', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })
  it('preserves the default wallet set for existing callers', async () => {
    const { connectWallet } = await import('@/lib/wallet/signing')
    expect(await connectWallet('testnet')).toBe('public-sender')
    expect(mocks.init).toHaveBeenCalledWith({ modules: mocks.modules, network: 'Test SDF Network ; September 2015' })
  })
  it('limits the fixture chooser to Freighter and preserves it when signing', async () => {
    const { connectWallet, signEnvelope } = await import('@/lib/wallet/signing')
    await connectWallet('testnet', { walletIds: ['freighter'] })
    expect(mocks.init).toHaveBeenCalledWith({ modules: [mocks.modules[0]], network: 'Test SDF Network ; September 2015' })
    expect(await signEnvelope('reviewed-envelope', 'testnet', 'public-sender')).toBe('signed-envelope')
    expect(mocks.init).toHaveBeenCalledTimes(1)
    expect(mocks.signTransaction).toHaveBeenCalledWith('reviewed-envelope', { address: 'public-sender', networkPassphrase: 'Test SDF Network ; September 2015' })
  })
  it('rejects an unsupported selection without opening a wallet chooser', async () => {
    const { connectWallet } = await import('@/lib/wallet/signing')
    await expect(connectWallet('testnet', { walletIds: ['unknown'] })).rejects.toThrow('No supported wallet')
    expect(mocks.authModal).not.toHaveBeenCalled()
  })
})
