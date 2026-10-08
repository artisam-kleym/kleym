import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const directory = dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await context.newPage()
const errors = []
const submissions = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('request', request => { if (request.method() === 'POST') submissions.push(request.url()) })

try {
  await page.goto('http://127.0.0.1:3218/', { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Fund, claim and reclaim' }).waitFor()
  const desktop = {
    recipientStateShown: await page.getByText('Recipient state: existing-trustline').isVisible(),
    senderAddressShown: await page.locator('#sender').textContent(),
    recipientAddressShown: await page.locator('#recipient').textContent(),
    fundDisabledBeforeLocalKeys: await page.locator('#fund-prepare').isDisabled(),
    noHorizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  }
  await page.screenshot({ path: join(directory, 'desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  const mobile = {
    noHorizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    fundDisabledBeforeLocalKeys: await page.locator('#fund-prepare').isDisabled(),
  }
  await page.screenshot({ path: join(directory, 'mobile.png'), fullPage: true })
  const state = await page.evaluate(async () => (await fetch('/state')).json())
  const result = {
    checkedAtUTC: new Date().toISOString(),
    desktop, mobile, browserErrors: errors, postRequestsBeforeUserAction: submissions,
    server: { recipientMode: state.recipientMode, fundedLinks: state.publicKeys.length,
      balanceIds: state.balanceIds.length, receipts: Object.keys(state.receipts), fatal: state.fatal },
  }
  await writeFile(join(directory, 'browser-result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  if (!desktop.recipientStateShown || !desktop.fundDisabledBeforeLocalKeys || !desktop.noHorizontalOverflow ||
      !mobile.fundDisabledBeforeLocalKeys || !mobile.noHorizontalOverflow || errors.length || submissions.length ||
      state.recipientMode !== 'existing-trustline' || state.publicKeys.length || state.balanceIds.length || state.fatal) {
    throw new Error('Browser preflight failed; inspect browser-result.json.')
  }
  process.stdout.write(JSON.stringify(result) + '\n')
} finally {
  await browser.close()
}
