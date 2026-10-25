import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const require = createRequire('D:/kleym/.worktrees/ci-issue-qualification/package.json')
const { chromium, expect } = require('@playwright/test')
const { Keypair } = require('@stellar/stellar-sdk')
const origin = 'https://kleym.test'
const issuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
const address = Keypair.random().publicKey()
const out = 'D:/kleym/.worktrees/app-sending-pilot/docs/reviews/2026-10-13/wallet-preparation/evidences'
mkdirSync(out + '/screenshots', { recursive: true })
const browser = await chromium.launch({ headless: true })
const checks = [], failures = []
const qaRoot = 'D:/kleym/.worktrees/ci-issue-qualification'
const sponsor = Keypair.random()
const fixtureEnv = { ...process.env, NODE_ENV: 'production', APP_URL: origin,
  WALLETCONNECT_PROJECT_ID: '', DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:1/fixture', REDIS_URL: 'redis://127.0.0.1:1',
  SESSION_SECRET: Buffer.alloc(32,7).toString('base64'), AUDIT_SIGNING_SEED: Buffer.alloc(32,9).toString('base64'), CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32,13).toString('base64'),
  SPONSOR_PUBLIC_KEY: sponsor.publicKey(), SPONSOR_SECRET_KEY: sponsor.secret(), SPONSORED_FUNDING_ENABLED: 'true', MAINNET_DISTRIBUTION_ENABLED: 'false',
  STELLAR_NETWORK: 'testnet', NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015', HORIZON_URL: 'https://horizon-testnet.stellar.org',
  RESEND_API_KEY: 're_fixture', EMAIL_FROM: 'noreply@kleym.test', OTEL_EXPORTER_OTLP_ENDPOINT: '' }
const servers = [ [3226,'https://android.golantern.xyz'], [3227,'chrome-extension://iflpkjgolcbleombhldiibhojohjpnmd'] ].map(([port,origins]) =>
  spawn(process.execPath,[qaRoot+'/node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:qaRoot,env:{...fixtureEnv,LANTERN_ORIGINS:origins},windowsHide:true,stdio:'ignore'}))
async function context(width, phone, framed = false, downloads = false, port = 3226) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true,
    ...(phone ? { userAgent: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36' } : {}) })
  const posts = [], errors = []
  await ctx.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === 'https://android.golantern.xyz') {
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><iframe style="width:100%;height:2100px;border:0" sandbox="allow-scripts allow-forms allow-popups allow-same-origin${downloads ? ' allow-downloads' : ''}" src="${origin}/campaigns/new"></iframe><script>
        const frame=document.querySelector('iframe'); window.addEventListener('message', e => {
          if(e.source!==frame.contentWindow || e.origin!==${JSON.stringify(origin)})return;
          if(e.data?.type==='lantern:getPublicKey')frame.contentWindow.postMessage({type:'lantern:publicKey',network:'TESTNET',publicKey:${JSON.stringify(address)}},${JSON.stringify(origin)});
          if(e.data?.type==='lantern:signXdr')throw Error('Unexpected transaction approval in this fixture');
        });</script>` })
    }
    if (url.origin !== origin) return route.abort()
    if (request.method() !== 'GET') { posts.push(url.pathname); return route.abort() }
    if (url.pathname === '/api/stellar/reserve') return route.fulfill({ json: { reservePerLink: '1.5', sponsoredReservePerLink: '1' } })
    if (url.pathname === '/api/stellar/account') return route.fulfill({ json: { exists: true, network: 'testnet', fundingMode: 'SPONSORED', balances: [
      { assetCode: 'XLM', assetIssuer: null, balance: '0' },
      { assetCode: 'USDC', assetIssuer: issuer, balance: '10' },
    ] } })
    if (url.pathname === '/api/claims/resolve') return route.fulfill({ json: { status: 'claimable', assetCode: 'USDC', assetIssuer: issuer, amount: '1', senderName: 'Local QA', expiresAt: '2027-01-01T00:00:00Z', network: 'testnet' } })
    const fixture = url.pathname === '/campaigns/new'
    const response = await route.fetch({ url: `http://127.0.0.1:${port}${fixture ? '/qa-mobile/wizard' : url.pathname}${url.search}` })
    if (fixture) {
      // Use a fixture component at the real public path. /qa-mobile is correctly
      // excluded from the production handoff/frame policy; copy only the real
      // login route's ancestor rule, keeping this response's script nonce.
      const policy = await fetch(`http://127.0.0.1:${port}/login`)
      const ancestor = policy.headers.get('content-security-policy').match(/frame-ancestors[^;]*/)[0]
      const headers=response.headers()
      headers['content-security-policy']=headers['content-security-policy'].replace(/frame-ancestors[^;]*/,ancestor)
      if(!policy.headers.has('x-frame-options'))delete headers['x-frame-options']
      return route.fulfill({response,headers})
    }
    return route.fulfill({ response })
  })
  const page = await ctx.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(framed ? 'https://android.golantern.xyz/' : origin + '/campaigns/new')
  const view = framed ? page.frameLocator('iframe') : page
  await expect(view.getByTestId('sender-connect-wallet')).toBeVisible()
  return { ctx, page, view, posts, errors }
}
async function review(view, connect = false) {
  await view.getByLabel('Campaign name').fill('Local wallet preparation proof')
  if (connect) {
    await view.getByTestId('sender-connect-wallet').click()
    await expect(view.getByLabel('Funding account', { exact: true })).toHaveValue(address)
  } else await view.getByLabel('Funding account', { exact: true }).fill(address)
  await view.getByLabel('Amount per link', { exact: true }).fill('1')
  await view.getByTestId('next-step').click()
  await view.getByLabel('Number of links').fill('3')
  await view.getByRole('button', { name: '1 hour', exact: true }).click()
  await view.getByTestId('next-step').click()
  await expect(view.getByTestId('review-link-count')).toHaveText('3')
}
async function generate(view) {
  // Disposable recovery words stay inside the browser. No trace, screenshot,
  // CSV content read or secret-bearing network request is retained.
  await view.getByTestId('phrase-new').click()
  await view.getByTestId('phrase-stored').check()
  await view.getByTestId('phrase-understood').check()
  await view.getByTestId('phrase-confirm').click()
  await view.getByTestId('generate-keys').click()
  await expect(view.getByTestId('sign-batches')).toBeDisabled()
}
async function closeContext(ctx) {
  await ctx.unrouteAll({behavior:'wait'})
  await ctx.close()
}
try {
  for (const port of [3226,3227]) {
    let ready=false
    for(let attempt=0;attempt<60;attempt++) {
      try { if((await fetch(`http://127.0.0.1:${port}/login`)).ok) {ready=true;break} } catch {}
      await new Promise(resolve=>setTimeout(resolve,250))
    }
    assert(ready, 'Local production fixture server did not start')
  }
  for (const [width, phone] of [[1440,false], [393,false], [393,true], [320,true]]) {
    const c = await context(width, phone)
    try {
      await expect(c.view.getByTestId('sender-connect-wallet')).toHaveText(phone ? 'Connect Freighter on phone' : 'Connect Freighter')
      await expect(c.view.getByTestId('funding-address-guidance')).toContainText('approval from that account')
      if (phone) await expect(c.page.getByRole('link', { name: 'Open in Lantern', exact: true })).toBeVisible()
      else await expect(c.page.getByRole('link', { name: 'Open in Lantern', exact: true })).toHaveCount(0)
      await review(c.view)
      if (phone) {
        await expect(c.page.getByTestId('wallet-handoff-blocked')).toBeVisible()
        await expect(c.page.getByRole('link', { name: 'Open in Lantern', exact: true })).toHaveCount(0)
      }
      assert(await c.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await c.page.evaluate(()=>scrollTo(0,0))
      await c.page.screenshot({ path: `${out}/screenshots/v5-review-${phone ? 'android' : 'desktop'}-${width}.png` })
      await c.view.getByRole('button', { name: 'Back', exact: true }).click()
      if (phone) await expect(c.page.getByRole('link', { name: 'Open in Lantern', exact: true })).toBeVisible()
      assert.deepEqual(c.posts, []); assert.deepEqual(c.errors, [])
      checks.push({ journey: `manual creator ${phone ? 'Android' : 'desktop'} ${width}px`, result: 'PASS', checks: 'Wallet name, manual signature guidance, 3-link Review, handoff guard/release, layout and zero writes' })
    } finally { await closeContext(c.ctx) }
  }
  for (const downloads of [false,true]) {
    const c = await context(393, true, true, downloads)
    try {
      await expect(c.view.getByTestId('sender-connect-wallet')).toHaveText('Connect Lantern')
      await review(c.view, true)
      await expect(c.view.getByTestId('lantern-export-guidance')).toBeVisible()
      assert(await c.view.getByTestId('review-link-count').evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
      await generate(c.view)
      const pendingDownload = c.page.waitForEvent('download', { timeout: 2500 }).catch(() => null)
      await c.view.getByTestId('download-secrets').click()
      const download = await pendingDownload
      assert.equal(!!download, downloads)
      await expect(c.view.getByTestId('sign-batches')).toBeDisabled()
      await expect(c.view.getByTestId('confirm-export-saved')).not.toBeChecked()
      if (download) {
        assert.equal(await download.failure(), null)
        await c.view.getByTestId('confirm-export-saved').check()
        await expect(c.view.getByTestId('sign-batches')).toBeEnabled()
        await c.view.getByTestId('confirm-export-saved').uncheck()
        await expect(c.view.getByTestId('sign-batches')).toBeDisabled()
      }
      assert.deepEqual(c.posts, []); assert.deepEqual(c.errors, [])
      checks.push({ journey: `trusted Lantern sender, sandbox downloads ${downloads ? 'permitted' : 'blocked'}`, result: 'PASS', downloadObserved: !!download, checks: 'Primary wallet, exact public-key connection, export guidance, actual Blob download behavior and saved-export signing gate; no signing/submission' })
    } finally { await closeContext(c.ctx) }
  }
  const extensionOnly = await context(393, true, false, false, 3227)
  try {
    await expect(extensionOnly.page.getByRole('link', { name: 'Open in Lantern', exact: true })).toHaveCount(0)
    checks.push({ journey: 'Android on extension-only configuration', result: 'PASS', checks: 'Does not offer an app handoff without the Android origin enabled' })
  } finally { await closeContext(extensionOnly.ctx) }
} catch (error) {
  failures.push(error.message)
  process.exitCode = 1
} finally {
  const report = { checkedAt: new Date().toISOString(), mode: 'Local production components and simulated trusted Lantern parent; not APK/extension hardware acceptance', browser: browser.version(), checks, failures, assetsMoved: false, privateExportRetained: false }
  writeFileSync(out + '/browser-verification-v5.json', JSON.stringify(report,null,2))
  console.log(JSON.stringify(report,null,2))
  await browser.close()
  servers.forEach(server=>server.kill())
}
