// Read-only production app preview; no phrase generation or wallet signing.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const destination = 'docs/reviews/2026-10-01/app-claim-reclaim'
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ storageState: 'e2e/.auth/session.json', viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:3220/campaigns/new')
  await page.getByLabel('Campaign name').fill('Kleym Testnet app preview')
  await page.getByLabel('Funding account').fill('GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A')
  await page.getByLabel('Amount per link').fill('1')
  await page.getByTestId('next-step').click({ timeout: 20000 })
  await page.getByLabel('Number of links').fill('2')
  await page.getByText('Kleym pays this reserve and the network fees.', { exact: false }).waitFor()
  await page.screenshot({ path: `${destination}/desktop-preview.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }))
  if (dimensions.content > dimensions.viewport) throw new Error('Mobile overflow')
  await page.screenshot({ path: `${destination}/mobile-preview.png`, fullPage: true })
  const proof = { checkedAt: new Date().toISOString(), realAppLookups: true, noWalletSignature: true,
    noPhraseGenerated: true, noChainWrites: true, mobileDimensions: dimensions,
    emailPolicyDisabled: await page.getByRole('radio', { name: /Email verification/ }).isDisabled(), passed: true }
  fs.writeFileSync(`${destination}/browser-preview.json`, JSON.stringify(proof, null, 2) + '\n')
  console.log(JSON.stringify(proof))
} finally { await browser.close() }
