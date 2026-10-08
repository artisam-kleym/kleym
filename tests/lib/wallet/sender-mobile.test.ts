import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mobile=vi.hoisted(()=>({connectMobile:vi.fn(),signMobile:vi.fn()}))
vi.mock('@/lib/wallet/mobile',()=>mobile)
const uri=`wc:${'a'.repeat(64)}@2?relay-protocol=irn&symKey=${'b'.repeat(64)}`
beforeEach(()=>{
  vi.resetModules();vi.clearAllMocks()
  const win={navigator:{userAgent:'Android'},location:{href:'https://kleym.test/campaigns/new'}}
  vi.stubGlobal('window',win)
})
afterEach(()=>vi.unstubAllGlobals())
it('uses phone pairing for campaign senders and publishes a retry link without campaign secrets',async()=>{
  mobile.connectMobile.mockImplementation(async(_network,_config,onUri)=>{onUri(uri);return 'selected-account'})
  const m=await import('@/lib/wallet/signing');m.configureSenderMobile('a'.repeat(32))
  expect(await m.connectWallet('testnet')).toBe('selected-account')
  expect(mobile.connectMobile.mock.calls[0][0]).toBe('testnet')
  expect(window.location.href).toContain('freighterwallet://wc-redirect?uri=')
  expect(window.location.href).not.toContain('kleym.test')
  expect(m.senderMobileSnapshot()).toBe('')
  mobile.signMobile.mockImplementation(async(xdr,network,address,sent)=>{expect(network).toBe('testnet');expect(address).toBe('selected-account');expect(window.location.href).not.toBe('freighterwallet://wc-redirect');sent();return xdr+'-signed'})
  expect(await m.signEnvelope('reviewed','testnet','selected-account')).toBe('reviewed-signed')
  expect(mobile.signMobile).toHaveBeenCalledWith('reviewed','testnet','selected-account',expect.any(Function))
  expect(window.location.href).toBe('freighterwallet://wc-redirect')
  expect(m.senderMobileSnapshot()).toBe('')
})
it('refuses an unconfigured phone before starting pairing',async()=>{
  const m=await import('@/lib/wallet/signing')
  await expect(m.connectWallet('testnet')).rejects.toThrow('not configured')
  expect(mobile.connectMobile).not.toHaveBeenCalled()
})
it('allows cancellation and refuses concurrent sender pairing',async()=>{
  mobile.connectMobile.mockImplementation(async(_network,_config,onUri,signal)=>{onUri(uri);return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled'))))})
  const m=await import('@/lib/wallet/signing');m.configureSenderMobile('a'.repeat(32))
  const first=m.connectWallet('testnet');const assertion=expect(first).rejects.toThrow('cancelled')
  await vi.waitFor(()=>expect(m.senderMobileSnapshot()).toContain('uri='))
  await expect(m.connectWallet('testnet')).rejects.toThrow('current phone connection')
  m.cancelSenderConnection();await assertion;expect(m.senderMobileSnapshot()).toBe('')
})
