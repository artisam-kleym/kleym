import {test,expect} from '@playwright/test'
import {Keypair} from '@stellar/stellar-sdk'

const claimable={status:'claimable',amount:'1',assetCode:'USDC',assetIssuer:'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',senderName:'QA awards',expiresAt:'2027-01-01T00:00:00Z',network:'testnet'}
for(const platform of ['desktop','android'] as const){
 test.describe(`${platform} link lookup recovery`,()=>{
  test.use({userAgent:platform==='android'?'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',viewport:{width:platform==='android'?393:1440,height:851}})
  for(const failure of ['503','429','offline','malformed-json'] as const){
   test(`recovers from ${failure} without losing keys or transferring funds`,async({page})=>{
    const secret=Keypair.random().secret(),requests:string[]=[],posts:string[]=[];let reads=0
    page.on('request',request=>{requests.push(request.url()+' '+(request.postData()??''));if(request.method()==='POST')posts.push(new URL(request.url()).pathname)})
    await page.route('**/api/claims/resolve*',route=>{
     if(++reads>1)return route.fulfill({json:claimable})
     if(failure==='offline')return route.abort('internetdisconnected')
     if(failure==='malformed-json')return route.fulfill({contentType:'application/json',body:'not-json'})
     return route.fulfill({status:Number(failure),json:{status:Number(failure)}})
    })
    await page.goto('/claim#s='+secret);await expect(page.getByTestId('claim-state')).toHaveText('failed')
    await expect(page.getByText('This link is not valid',{exact:false})).toHaveCount(0)
    expect(await page.evaluate(()=>location.hash)).toBe('')
    await page.getByTestId('claim-retry').click();await expect(page.getByTestId('claim-state')).toHaveText('ready')
    expect(reads).toBe(2);expect(posts).toEqual([]);expect(requests.some(request=>request.includes(secret))).toBe(false)
    await expect(page.getByTestId(platform==='android'?'claim-connect-mobile':'claim-connect')).toBeVisible()
   })
  }
  test('keeps genuinely unavailable links terminal and reveals no reason',async({page})=>{
   await page.route('**/api/claims/resolve*',route=>route.fulfill({json:{status:'unavailable',assetCode:null,assetIssuer:null,amount:null,senderName:null,expiresAt:null,network:null}}))
   await page.goto('/claim#s='+Keypair.random().secret());await expect(page.getByTestId('claim-state')).toHaveText('invalid');await expect(page.getByTestId('claim-retry')).toHaveCount(0)
  })
 })
}
