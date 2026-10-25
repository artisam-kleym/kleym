'use client'

/** Desktop-only Freighter adapter. Mobile WalletConnect and Lantern remain separate transports. */
import { Networks } from '@stellar/stellar-sdk'
export { Networks }

const missing = () => new Error('Open Freighter in this desktop browser, unlock it, then try again.')
const api = () => import('@stellar/freighter-api')

export class FreighterDesktop {
  async isAvailable() {
    const stellar = typeof window === 'undefined' ? undefined : (window as Window & { stellar?: { provider?: string; platform?: string } }).stellar
    if (stellar?.provider === 'freighter' && stellar.platform === 'mobile') return false
    try {
      const result = await (await api()).isConnected()
      return !result.error && result.isConnected
    } catch { return false }
  }
  private async availableApi() {
    if (!await this.isAvailable()) throw missing()
    return api()
  }
  async getAddress(options: { skipRequestAccess?: boolean } = {}) {
    const freighter = await this.availableApi()
    if (!options.skipRequestAccess) {
      const access = await freighter.requestAccess()
      if (access.error) throw access.error
    }
    const result = await freighter.getAddress()
    if (result.error) throw result.error
    if (!result.address) throw new Error('Freighter did not return an address. Connect your wallet and try again.')
    return { address: result.address }
  }
  async getNetwork() {
    const result = await (await this.availableApi()).getNetwork()
    if (result.error) throw result.error
    return { network: result.network, networkPassphrase: result.networkPassphrase }
  }
  async signTransaction(xdr: string, options: { address: string; networkPassphrase: string }) {
    const result = await (await this.availableApi()).signTransaction(xdr, options)
    if (result.error) throw result.error
    return { signedTxXdr: result.signedTxXdr, signerAddress: result.signerAddress }
  }
}
