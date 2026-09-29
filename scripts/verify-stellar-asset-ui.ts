/** Browser proof of asset control HTML; no auth, wallet, CSS or ledger claims.
 * Uses the project's installed React/Playwright dependencies. Full hydrated
 * browser journeys remain in e2e/ and require isolated PostgreSQL/Redis.
 */
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { AssetStep } from '../src/app/(sender)/campaigns/new/steps'
import { stellarMetadata } from '../src/lib/stellar/network'

const metadata = stellarMetadata('testnet')
const noop = () => {}
const properties: ComponentProps<typeof AssetStep> = {
  stellar: metadata,
  draft: { network: 'testnet', senderPublicKey: '', name: 'Network boundary proof', amountPerLink: '1', assetCode: 'USDC', assetIssuer: metadata.defaultAsset.assetIssuer },
  balances: [
    { assetCode: 'XLM', assetIssuer: null, balance: '100' },
    { ...metadata.defaultAsset, balance: '10' },
    { assetCode: 'USDC', assetIssuer: stellarMetadata('public').defaultAsset.assetIssuer, balance: '9999' },
  ],
  onChange: noop, accountExists: true, checking: false,
  receiveAsRaw: '', receiveAsError: null, onReceiveAs: noop,
  allowExchangeDeposit: false, onAllowExchangeDeposit: noop,
  emailReceipts: false, onEmailReceipts: noop,
}

const output = resolve(process.argv[2] ?? 'docs/reviews/issue-96/browser')
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const html = renderToStaticMarkup(createElement(AssetStep, properties))
  await page.setContent(html)
  await expect(page.getByLabel('Network', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('Network', { exact: true })).toHaveValue('testnet')
  await expect(page.getByText(metadata.valueNotice, { exact: true })).toBeVisible()
  await expect(page.getByLabel('Asset', { exact: true })).toHaveValue(`USDC:${metadata.defaultAsset.assetIssuer}`)
  const options = page.getByLabel('Asset', { exact: true }).locator('option')
  await expect(options).toHaveCount(2)
  await page.getByLabel('Asset', { exact: true }).selectOption('XLM:')
  await expect(page.getByLabel('Asset', { exact: true })).toHaveValue('XLM:')
  await page.screenshot({ path: resolve(output, 'funded-asset-controls.png'), fullPage: true })

  const unavailable = renderToStaticMarkup(createElement(AssetStep, { ...properties, balances: properties.balances.filter((asset) => asset.assetCode !== 'USDC') }))
  await page.setContent(unavailable)
  await expect(page.getByLabel('Asset', { exact: true })).toHaveValue(`USDC:${metadata.defaultAsset.assetIssuer}`)
  await expect(page.getByLabel('Asset', { exact: true }).locator('option:checked')).toHaveText('USDC — unavailable in this account')
  await page.screenshot({ path: resolve(output, 'unavailable-usdc-controls.png'), fullPage: true })
  await writeFile(resolve(output, 'result.json'), JSON.stringify({
    passed: true,
    checks: ['deployment network locked', 'testnet value notice visible', 'official USDC selected', 'other-network same-code issuer excluded', 'native XLM selectable', 'missing USDC remains unavailable without fallback'],
    scope: 'Server-rendered AssetStep HTML in Chromium; no hydration, CSS/layout, authenticated journey, wallet signing or settlement proof',
    browser: browser.version(),
  }, null, 2))
  console.log('PASS: six asset/network control checks in Chromium; evidence scope recorded.')
} finally {
  await browser.close()
}
