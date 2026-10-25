import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FreighterDesktop } from '@/lib/wallet/desktop'
const freighter = vi.hoisted(() => ({
  isConnected: vi.fn(), requestAccess: vi.fn(), getAddress: vi.fn(), getNetwork: vi.fn(), signTransaction: vi.fn(),
}))
vi.mock('@stellar/freighter-api', () => freighter)
afterEach(() => vi.unstubAllGlobals())
beforeEach(() => {
  vi.resetAllMocks()
  freighter.isConnected.mockResolvedValue({ isConnected: true })
  freighter.requestAccess.mockResolvedValue({ address: 'public-account' })
  freighter.getAddress.mockResolvedValue({ address: 'public-account' })
  freighter.getNetwork.mockResolvedValue({ networkPassphrase: 'Test SDF Network ; September 2015' })
  freighter.signTransaction.mockResolvedValue({ signedTxXdr: 'signed-envelope', signerAddress: 'public-account' })
})
describe('official Freighter API transport', () => {
  it('leaves the Freighter mobile provider to the mobile transport', async () => {
    vi.stubGlobal('window', { stellar: { provider: 'freighter', platform: 'mobile' } })
    expect(await new FreighterDesktop().isAvailable()).toBe(false)
    expect(freighter.isConnected).not.toHaveBeenCalled()
  })
  it('requests access explicitly and never signs while connecting', async () => {
    expect(await new FreighterDesktop().getAddress()).toEqual({ address: 'public-account' })
    expect(freighter.requestAccess).toHaveBeenCalledOnce()
    expect(freighter.signTransaction).not.toHaveBeenCalled()
  })
  it('reads a connected account for a proof without asking for access again', async () => {
    await new FreighterDesktop().getAddress({ skipRequestAccess: true })
    expect(freighter.requestAccess).not.toHaveBeenCalled()
  })
  it('preserves wallet cancellation without proceeding to address lookup', async () => {
    const error = { code: -4, message: 'User declined' }
    freighter.requestAccess.mockResolvedValue({ error })
    await expect(new FreighterDesktop().getAddress()).rejects.toEqual(error)
    expect(freighter.getAddress).not.toHaveBeenCalled()
  })
  it('does not call signing or request access when detection fails', async () => {
    freighter.isConnected.mockResolvedValue({ isConnected: false })
    await expect(new FreighterDesktop().signTransaction('reviewed', { address: 'public-account', networkPassphrase: 'test' })).rejects.toThrow('Open Freighter')
    expect(freighter.signTransaction).not.toHaveBeenCalled()
    expect(freighter.requestAccess).not.toHaveBeenCalled()
  })
  it('returns false on extension transport errors', async () => {
    freighter.isConnected.mockRejectedValue(new Error('Extension context invalidated'))
    expect(await new FreighterDesktop().isAvailable()).toBe(false)
  })
  it('passes reviewed bytes and signature constraints unchanged and preserves errors', async () => {
    const options = { address: 'public-account', networkPassphrase: 'Test SDF Network ; September 2015' }
    expect(await new FreighterDesktop().signTransaction('reviewed', options)).toEqual({ signedTxXdr: 'signed-envelope', signerAddress: 'public-account' })
    expect(freighter.signTransaction).toHaveBeenCalledWith('reviewed', options)
    const error = { code: -4, message: 'User declined' }
    freighter.signTransaction.mockResolvedValue({ error })
    await expect(new FreighterDesktop().signTransaction('reviewed', options)).rejects.toEqual(error)
  })
  it('rejects absent addresses and network errors', async () => {
    freighter.getAddress.mockResolvedValue({ address: '' })
    await expect(new FreighterDesktop().getAddress()).rejects.toThrow('did not return an address')
    freighter.getNetwork.mockResolvedValue({ error: { message: 'Locked' } })
    await expect(new FreighterDesktop().getNetwork()).rejects.toEqual({ message: 'Locked' })
  })
})
