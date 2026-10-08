/** Actual campaign components in Chromium; fixture reads/router/wallet, no chain or database writes. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const require = createRequire(import.meta.resolve('tsx'))
const { build } = require('esbuild')
const out = 'docs/reviews/2026-10-08/custom-prizes'
mkdirSync(out, { recursive: true })
const source = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {CampaignWizard} from '@/app/(sender)/campaigns/new/wizard';
import {stellarMetadata} from '@/lib/stellar/network';
const stellar=stellarMetadata('testnet');
createRoot(document.getElementById('app')).render(<CampaignWizard stellar={stellar} appUrl={location.origin} maxOpsPerBatch={90} maxLinksPerCampaign={10000} baseFeeStroops="1000" screening={false} template={{
  templateId:'fixture',templateName:'Prize example',draftCampaignId:null,name:'Prize example',network:'testnet',
  senderPublicKey:'GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A',assetCode:'USDC',assetIssuer:stellar.defaultAsset.assetIssuer,
  amountPerLink:'5',expiresAt:new Date(Date.now()+86400000).toISOString(),claimPolicy:'open',reminderDaysBefore:[],receiveAsRaw:'',allowExchangeDeposit:false,recipientsCsv:'',linkCount:5
}}/>);
`
const fixture = await build({
  absWorkingDir: process.cwd(), stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx', sourcefile: 'custom-prize-ui-fixture.tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2022', jsx: 'automatic', minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'isolated-navigation-wallet', setup(plugin) {
    plugin.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'router', namespace: 'fixture' }))
    plugin.onResolve({ filter: /^@\/lib\/wallet\/signing$/ }, () => ({ path: 'wallet', namespace: 'fixture' }))
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'router'
      ? 'export function useRouter(){return {push(){throw Error("Navigation is outside this fixture")}}}'
      : 'export async function connectWallet(){throw Error("Wallet actions disabled in UI proof")}; export async function signEnvelope(){throw Error("Wallet actions disabled in UI proof")}; export async function walletErrorMessage(error){return error.message}' }))
  } }],
})
const cssName = readdirSync('.next/static/css').find((name) => name.endsWith('.css'))
assert(cssName, 'Build production CSS before UI proof')
const css = readFileSync(resolve('.next/static/css', cssName))
const fonts = { '/inter.woff2': 'inter-latin', '/mono.woff2': 'jetbrains-mono-latin', '/icons.woff2': 'material-symbols-subset' }
const checks = [], requests = [], errors = []
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture.local')
  if (request.method !== 'GET') { requests.push({ method: request.method, path: url.pathname }); response.writeHead(405); response.end('{}'); return }
  if (url.pathname === '/bundle.js') { response.setHeader('content-type', 'text/javascript'); response.end(fixture.outputFiles[0].contents); return }
  if (url.pathname === '/style.css') { response.setHeader('content-type', 'text/css'); response.end(css); return }
  if (fonts[url.pathname]) { response.setHeader('content-type', 'font/woff2'); response.end(readFileSync(`src/fonts/${fonts[url.pathname]}.woff2`)); return }
  if (url.pathname.startsWith('/api/')) {
    response.setHeader('content-type', 'application/json')
    requests.push({ method: 'GET', path: url.pathname })
    if (url.pathname === '/api/stellar/reserve') response.end(JSON.stringify({ reservePerLink: '1.5', sponsoredReservePerLink: '1' }))
    else if (url.pathname === '/api/stellar/account') response.end(JSON.stringify({ exists: true, balances: [{ assetCode: 'USDC', assetIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', balance: '1000' }, { assetCode: 'XLM', assetIssuer: null, balance: '0' }] }))
    else { response.writeHead(404); response.end('{}') }
    return
  }
  response.setHeader('content-type', 'text/html')
  response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Custom prize UI proof</title><link rel="stylesheet" href="/style.css"><style>@font-face{font-family:FixtureSans;src:url(/inter.woff2);font-weight:100 900}@font-face{font-family:FixtureMono;src:url(/mono.woff2);font-weight:100 800}@font-face{font-family:FixtureIcons;src:url(/icons.woff2);font-weight:100 700}:root{--font-sans:FixtureSans;--font-mono:FixtureMono;--font-icons:FixtureIcons}body{font-family:FixtureSans}</style></head><body><main style="max-width:1100px;margin:auto;padding:20px"><div id="app"></div></main><script src="/bundle.js"></script></body></html>')
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
let browser
try {
  browser = await chromium.launch({ headless: true })
  const origin = `http://127.0.0.1:${server.address().port}`
  for (const phone of [false, true]) {
    const context = await browser.newContext({ viewport: phone ? { width: 393, height: 851 } : { width: 1280, height: 1000 } })
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(origin)
    await page.getByTestId('next-step').click()
    await page.getByRole('button', { name: 'Set individual amounts', exact: true }).click()
    for (const [index, amount] of ['20', '15', '10'].entries()) await page.locator(`[name="prize-${index + 1}"]`).fill(amount)
    const total = page.locator('div').filter({ has: page.getByText('Total to send', { exact: true }) }).filter({ has: page.getByText('55', { exact: true }) })
    await page.getByText('55', { exact: true }).waitFor()
    assert(await total.count() > 0)
    assert.equal(await page.locator('[name="prize-4"]').getAttribute('placeholder'), '5')
    await page.locator('#labels').fill('Alice\nBob\nCarol')
    assert.equal(await page.locator('[name="prize-1"]').inputValue(), '20')
    await page.locator('[name="prize-2"]').fill('0')
    await page.getByRole('alert').filter({ hasText: 'Person 2 has an invalid amount' }).waitFor()
    assert(await page.getByTestId('next-step').isDisabled())
    await page.locator('[name="prize-2"]').fill('15')
    await page.getByTestId('next-step').click()
    await page.getByRole('heading', { name: 'Prize breakdown' }).waitFor()
    assert.equal(await page.locator('[name="prize-1"]').getAttribute('readonly'), '')
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    assert.equal(await page.locator('#labels').inputValue(), 'Alice\nBob\nCarol')
    assert.equal(await page.locator('[name="prize-3"]').inputValue(), '10')
    await page.locator('[name="prize-1"]').fill('')
    await page.getByText('40', { exact: true }).waitFor()
    await page.locator('[name="prize-1"]').fill('20')
    const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    assert.equal(overflowing, false, 'No horizontal overflow at this viewport')
    await page.getByRole('heading', { name: 'Prize amounts', exact: true }).scrollIntoViewIfNeeded()
    await page.evaluate(() => document.fonts.ready)
    assert.equal(await page.evaluate(() => document.fonts.check('16px FixtureSans')), true, 'Local app font is loaded for visual proof')
    await page.screenshot({ path: `${out}/${phone ? 'phone' : 'desktop'}-custom-prizes.png`, fullPage: true })
    await page.locator('section').filter({ has: page.getByRole('heading', { name: 'Prize amounts', exact: true }) }).screenshot({ path: `${out}/${phone ? 'phone' : 'desktop'}-prize-editor.png` })
    checks.push(`${phone ? 'Phone' : 'Desktop'} actual wizard: 20/15/10 + defaults; labels preserve overrides; invalid amount blocks Continue; read-only review/back; clear restores default; no horizontal overflow`)
    await page.locator('[name="linkCount"]').fill('25')
    await page.getByRole('button', { name: 'Next people', exact: true }).click()
    await page.locator('[name="prize-11"]').fill('25')
    await page.getByRole('button', { name: 'Previous people', exact: true }).click()
    assert.equal(await page.locator('[name="prize-1"]').inputValue(), '20')
    await page.locator('[name="linkCount"]').fill('5')
    await page.locator('[name="linkCount"]').fill('25')
    await page.getByRole('button', { name: 'Next people', exact: true }).click()
    assert.equal(await page.locator('[name="prize-11"]').inputValue(), '')
    await page.getByRole('button', { name: 'Use default for everyone', exact: true }).click()
    await page.getByText('125', { exact: true }).waitFor()
    await page.locator('#labels').fill('label,amount\nAlice,20\nBob,15\nCarol,10')
    await page.getByRole('button', { name: 'Previous people', exact: true }).click()
    assert.equal(await page.locator('[name="prize-2"]').inputValue(), '15')
    await page.locator('[name="prize-2"]').fill('30')
    const updatedCsv = await page.locator('#labels').inputValue()
    assert(updatedCsv.includes('"30"'), 'Manual changes synchronize an imported amount column')
    await page.locator('#labels').fill(updatedCsv.replace('"Bob"', '"Bobby"'))
    assert.equal(await page.locator('[name="prize-2"]').inputValue(), '30')
    await page.locator('#labels').fill('label,amount\nAlice,\nBob,\nCarol,')
    assert.equal(await page.locator('[name="prize-2"]').inputValue(), '')
    checks.push(`${phone ? 'Phone' : 'Desktop'} pagination retains rows; shrinking count discards removed overrides; reset uses all defaults; CSV import/clear and manual edits preserve synchronized amounts`)
    await context.close()
  }
  assert.deepEqual(errors, [])
  assert(requests.every((request) => request.method === 'GET'), 'UI proof made no mutation requests')
  checks.push('No page exceptions, wallet connection/signature requests, database writes or transaction submissions')
  writeFileSync(`${out}/browser-verification.json`, JSON.stringify({ date: '2026-10-08', mode: 'Actual CampaignWizard and child components bundled with production CSS; fixture account/reserve reads and router/wallet stubs; not deployed-wallet acceptance', checks, requests }, null, 2))
  console.log(JSON.stringify({ passed: checks.length, checks }))
} finally {
  if (browser) await browser.close()
  await new Promise((done) => server.close(done))
}
