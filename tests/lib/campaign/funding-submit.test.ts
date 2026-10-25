import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {Account,Keypair,Networks,Operation,TransactionBuilder} from '@stellar/stellar-sdk'
import {submitFundingBatch} from '@/lib/campaign/funding-submit'
const tx=new TransactionBuilder(new Account(Keypair.random().publicKey(),'1'),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(Operation.manageData({name:'disposable-public-proof',value:'no-secret'})).setTimeout(60).build()
const input={campaignId:'fixture-campaign',sequence:1,signedXdr:tx.toXDR(),network:'testnet' as const},hash=tx.hash().toString('hex')
const post=()=>new Response(JSON.stringify({detail:'A request with this Idempotency-Key is still in progress.'}),{status:409})
const status=(state:string,h:string|null=hash)=>new Response(JSON.stringify({batches:[{sequence:1,status:state,transactionHash:h}]}))
beforeEach(()=>vi.useFakeTimers())
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
it('accepts the original successful response without any status read',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response('{}',{status:202}));vi.stubGlobal('fetch',fetcher)
 await submitFundingBatch(input);expect(fetcher).toHaveBeenCalledTimes(1)
})
it.each(['SUBMITTED','CONFIRMED'])('recovers a concurrent response from the exact %s transaction without another POST',async state=>{
 const fetcher=vi.fn().mockResolvedValueOnce(post()).mockResolvedValueOnce(status(state));vi.stubGlobal('fetch',fetcher)
 await submitFundingBatch(input);expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(1)
})
it('waits while the first request is pending, then recovers its confirmed hash',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(post()).mockResolvedValueOnce(status('PENDING',null)).mockResolvedValueOnce(status('CONFIRMED'));vi.stubGlobal('fetch',fetcher)
 const result=submitFundingBatch(input);await vi.advanceTimersByTimeAsync(1500);await result
 expect(fetcher).toHaveBeenCalledTimes(3)
})
it('recovers a lost POST response through reads only',async()=>{
 const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('Network lost')).mockResolvedValueOnce(status('CONFIRMED'));vi.stubGlobal('fetch',fetcher)
 await submitFundingBatch(input);expect(fetcher.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(1)
})
it('refuses a different transaction hash even when its status says confirmed',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(post()).mockResolvedValueOnce(status('CONFIRMED','a'.repeat(64))))
 await expect(submitFundingBatch(input)).rejects.toThrow('different funding transaction')
})
it('preserves a genuine validation refusal without polling or hiding it',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:'Wrong signer'}),{status:409}));vi.stubGlobal('fetch',fetcher)
 await expect(submitFundingBatch(input)).rejects.toThrow('Wrong signer');expect(fetcher).toHaveBeenCalledTimes(1)
})
it('stops on a failed batch and preserves prior funded links',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(post()).mockResolvedValueOnce(status('FAILED')))
 await expect(submitFundingBatch(input)).rejects.toThrow('Earlier funded links are preserved')
})
it('times out an unavailable status without another payment request',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(post()).mockImplementation(()=>Promise.reject(new Error('Unavailable')));vi.stubGlobal('fetch',fetcher)
 const result=expect(submitFundingBatch(input)).rejects.toThrow('open the campaign before signing again')
 await vi.advanceTimersByTimeAsync(46000);await result
 expect(fetcher.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(1)
})
