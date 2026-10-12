/** Local production UI + mocked parent bridge. No relay, wallet keys or chain writes. */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { Keypair } from '@stellar/stellar-sdk'
import assert from 'node:assert/strict'

const out=process.argv[2] ?? 'docs/reviews/2026-10-08/lantern-integration'
mkdirSync(out,{recursive:true})
const seed=Keypair.random(), wallet=Keypair.random().publicKey(), sponsor=Keypair.random()
const env={...process.env,NODE_ENV:'production',APP_URL:'https://kleym.test',LANTERN_ORIGINS:'https://android.golantern.xyz',WALLETCONNECT_PROJECT_ID:'',DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:1/fixture',REDIS_URL:'redis://127.0.0.1:1',SESSION_SECRET:Buffer.alloc(32,7).toString('base64'),AUDIT_SIGNING_SEED:Buffer.alloc(32,9).toString('base64'),CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,13).toString('base64'),SPONSOR_PUBLIC_KEY:sponsor.publicKey(),SPONSOR_SECRET_KEY:sponsor.secret(),STELLAR_NETWORK:'testnet',NETWORK_PASSPHRASE:'Test SDF Network ; September 2015',HORIZON_URL:'https://horizon-testnet.stellar.org',RESEND_API_KEY:'re_fixture',EMAIL_FROM:'noreply@kleym.test',OTEL_EXPORTER_OTLP_ENDPOINT:''}
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3230'],{env,windowsHide:true,stdio:'ignore'})
const checks=[]
let browser
try {
  for(let n=0;n<80;n++){try{if((await fetch('http://127.0.0.1:3230/login')).ok)break}catch{}await new Promise(r=>setTimeout(r,300));if(n===79)throw Error('Preview unavailable')}
  browser=await chromium.launch({headless:true,channel:'chromium'})
  async function context(phone=false){
    const ctx=await browser.newContext({viewport:phone?{width:393,height:851}:{width:1280,height:900},...(phone?{userAgent:'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/153.0.0.0 Mobile Safari/537.36'}:{})})
    await ctx.route('https://kleym.test/**',async route=>{
      const url=new URL(route.request().url())
      if(url.pathname==='/api/claims/resolve')return route.fulfill({json:{status:'claimable',assetCode:'USDC',assetIssuer:'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',amount:'1',senderName:'QA fixture',expiresAt:'2027-01-01T00:00:00.000Z',network:'testnet'}})
      const response=await route.fetch({url:'http://127.0.0.1:3230'+url.pathname+url.search})
      await route.fulfill({response})
    })
    return ctx
  }
  for(const phone of [false,true]){
    const ctx=await context(phone),page=await ctx.newPage();await page.goto('https://kleym.test/login')
    if(phone){await page.getByRole('link',{name:'Open in Lantern',exact:true}).waitFor();const href=await page.getByRole('link',{name:'Open in Lantern',exact:true}).getAttribute('href');assert(href.startsWith('intent://open'));await page.screenshot({path:out+'/android-open-lantern.png'});checks.push('Android sender/login has safe app-opening link')}
    else{assert.equal(await page.getByRole('link',{name:'Open in Lantern',exact:true}).count(),0);checks.push('Desktop has no Android app-opening button')}
    await ctx.close()
  }
  const ctx=await context(true),page=await ctx.newPage()
  await ctx.route('https://android.golantern.xyz/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><title>Mock Lantern parent</title><iframe style="width:390px;height:850px;border:0" sandbox="allow-scripts allow-forms allow-same-origin" src="https://kleym.test/claim#s=${seed.secret()}"></iframe><script>window.requests=[];addEventListener('message',e=>{if(e.origin!=='https://kleym.test')return;requests.push(e.data.type);if(e.data.type==='lantern:getPublicKey')e.source.postMessage({type:'lantern:publicKey',publicKey:'${wallet}',network:'TESTNET'},'https://kleym.test')})</script>`}))
  await page.goto('https://android.golantern.xyz/')
  const frame=page.frameLocator('iframe')
  await frame.getByRole('button',{name:'Connect Lantern',exact:true}).waitFor()
  assert.equal(await frame.getByRole('button',{name:'Connect Freighter on phone',exact:true}).count(),0)
  await frame.getByRole('button',{name:'Connect Lantern',exact:true}).click()
  await frame.getByRole('button',{name:'Claim 1 USDC',exact:true}).waitFor()
  assert.deepEqual(await page.evaluate(()=>window.requests),['lantern:getPublicKey'])
  assert.equal(await frame.getByText('Destination: '+wallet,{exact:true}).count(),1)
  assert.equal(new URL(page.frames()[1].url()).hash,'')
  await page.screenshot({path:out+'/embedded-lantern-claim.png'})
  checks.push('Trusted Android iframe hydrates, selects Lantern, validates connect response and does not submit/sign on connect')
  await ctx.close()
  const claim=await fetch('http://127.0.0.1:3230/claim');assert(claim.headers.get('content-security-policy').includes('frame-ancestors https://android.golantern.xyz'));assert.equal(claim.headers.get('x-frame-options'),null);assert.equal(claim.headers.get('referrer-policy'),'no-referrer')
  checks.push('Runtime embedding CSP and claim no-referrer headers match policy')
  for (const path of ['/templates', '/templates/example', '/approvals', '/history']) {
    // These authenticated routes can redirect to login without a database fixture.
    // Check the route's own production headers, not the redirect target's headers.
    const response = await fetch('http://127.0.0.1:3230' + path, { redirect: 'manual' })
    assert.equal(response.headers.get('x-frame-options'), null)
    assert(response.headers.get('content-security-policy').includes('frame-ancestors https://android.golantern.xyz'))
    checks.push(`Production ${path} permits only the trusted Lantern ancestor`)
  }
  for (const path of ['/api/templates', '/admin', '/templates-evil', '/approvals-evil', '/history-evil']) {
    const response = await fetch('http://127.0.0.1:3230' + path, { redirect: 'manual' })
    assert.equal(response.headers.get('x-frame-options'), 'DENY')
    assert(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"))
    checks.push(`Production ${path} remains unframeable`)
  }
  const denied=await fetch('http://127.0.0.1:3230/api/auth/login',{method:'POST',headers:{origin:'https://evil.test','content-type':'application/json'},body:'{}'});assert.equal(denied.status,403);assert.equal((await denied.json()).status,403)
  checks.push('Production middleware refuses cross-origin authentication mutation')
  writeFileSync(out+'/browser-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),network:'No chain calls',mode:'Production app; mocked parent and resolve API; not an actual Lantern wallet; authenticated route coverage checks original response headers, not data-backed page content',checks},null,2))
  console.log(JSON.stringify({passed:checks.length,checks}))
} finally {if(browser)await browser.close();server.kill()}
