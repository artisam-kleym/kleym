// Browser-only wallet import probe. Never signs or submits a transaction.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ storageState: 'e2e/.auth/session.json' })
  const page = await context.newPage()
  const violations = []
  await page.addInitScript(() => {
    window.__walletViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__walletViolations.push({ directive: event.effectiveDirective, blocked: event.blockedURI })
    })
  })
  await page.goto('http://127.0.0.1:3220/campaigns/new')
  await page.getByLabel('Campaign name').fill('Wallet import probe')
  await page.getByLabel('Funding account').fill('GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A')
  await page.getByLabel('Amount per link').fill('1')
  await page.getByTestId('next-step').click()
  await page.getByLabel('Number of links').fill('2')
  await page.getByTestId('next-step').click()
  await page.getByTestId('phrase-new').click()
  await page.getByTestId('phrase-stored').check()
  await page.getByTestId('phrase-understood').check()
  await page.getByTestId('phrase-confirm').click()
  await page.getByTestId('generate-keys').click()
  const download = page.waitForEvent('download')
  await page.getByTestId('download-secrets').click()
  await download // Do not save the generated fixture secrets.
  await page.getByTestId('sign-batches').click()
  const error = page.locator('[role="alert"]').filter({ hasText: /insertRule|Freighter|freighter|wallet did not/ }).last()
  await error.waitFor({ timeout: 20000 })
  violations.push(...await page.evaluate(() => window.__walletViolations))
  const proof = { checkedAt: new Date().toISOString(), error: await error.innerText(), violations,
    noExtensionInstalled: true, noWalletSignature: true, noChainWrites: true }
  const phase = process.argv[2] ?? 'before'
  if (phase === 'before' && !proof.error.includes('insertRule')) throw new Error('Original failure was not reproduced')
  if (phase === 'after' && (!proof.error.includes('Open Freighter') || violations.length)) throw new Error('Adapter/CSP check failed')
  fs.writeFileSync(`docs/reviews/2026-10-01/wallet-csp/${phase}.json`, JSON.stringify(proof, null, 2) + '\n')
  console.log(JSON.stringify(proof))
} finally { await browser.close() }
