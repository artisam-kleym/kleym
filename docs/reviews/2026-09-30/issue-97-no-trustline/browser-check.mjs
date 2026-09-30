import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { Keypair } from '@stellar/stellar-sdk'

const directory = dirname(fileURLToPath(import.meta.url))
const checkout = resolve(directory, '../../../..')
const output = join(directory, `browser-${new Date().toISOString().replace(/[:.]/g, '-')}`)
await mkdir(output)
const sender = 'GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A'
// Only an offline public placeholder is used. No fixture account is funded here.
const recipient = Keypair.random().publicKey()
const url = 'http://127.0.0.1:3217'
const browser = await chromium.launch({ headless: true })
const cases = []

try {
  try {
    await fetch(`${url}/status`, { signal: AbortSignal.timeout(1000) })
    throw new Error('Port 3217 already has a session; do not replace it.')
  } catch (error) {
    if (error.message !== 'fetch failed') throw error
  }
  for (const mode of ['sender-usdc', 'recipient-account-only']) {
    const server = spawn(process.execPath, ['--import', 'tsx', 'scripts/spike-freighter-bootstrap.ts', sender, recipient, output, mode], {
      cwd: checkout, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let serverOutput = ''
    server.stdout.on('data', chunk => { serverOutput += chunk.toString() })
    server.stderr.on('data', chunk => { serverOutput += chunk.toString() })
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    const errors = []
    const posts = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()) })
    try {
      let state
      for (let attempt = 0; attempt < 30; attempt++) {
        if (server.exitCode !== null) throw new Error(`Proof server exited before readiness: ${serverOutput}`)
        try {
          const response = await fetch(`${url}/status`, { signal: AbortSignal.timeout(1000) })
          if (response.ok) { state = await response.json(); break }
        } catch { /* Wait for this child process to bind. */ }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      assert.ok(state, `Server did not become ready: ${serverOutput}`)
      assert.equal(state.mode, mode)
      assert.equal(state.target, mode === 'sender-usdc' ? sender : recipient)
      assert.equal(state.network, 'testnet')
      assert.equal(state.receipt, undefined)
      await page.goto(url, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: `Set up your Testnet ${state.targetLabel}` }).waitFor()
      assert.equal(await page.locator('#sender').textContent(), sender)
      assert.equal(await page.locator('#recipient').textContent(), recipient)
      assert.ok(await page.getByRole('button', { name: `2. Prepare ${state.targetLabel} setup` }).isDisabled())
      assert.ok(await page.locator('#sign').isDisabled())
      assert.ok(await page.locator('#submit').isDisabled())
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      if (mode === 'recipient-account-only') {
        assert.ok(await page.getByText('zero XLM and no USDC trustline', { exact: true }).isVisible())
        assert.ok(await page.getByText('Kleym Recipient - No Trustline', { exact: true }).isVisible())
      }
      await page.screenshot({ path: join(output, `${mode}-desktop.png`), fullPage: true })
      await page.setViewportSize({ width: 390, height: 844 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: join(output, `${mode}-mobile.png`), fullPage: true })
      await page.locator('#connect').click()
      await page.getByText('Freighter', { exact: true }).first().waitFor()
      assert.deepEqual(posts, [])
      assert.deepEqual(errors, [])
      cases.push({ mode, network: state.network, targetLabel: state.targetLabel,
        desktopWidth: 1280, mobileWidth: 390, initialSigningStepsDisabled: true,
        noHorizontalOverflow: true, freighterChooserVisible: true, browserErrors: errors,
        postRequests: posts, actualFreighterSignature: false, ledgerMutation: false })
    } finally {
      await context.close()
      // This child has made no mutation and holds no sponsorship obligations.
      server.kill()
      if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve))
    }
  }
  const result = { checkedAtUTC: new Date().toISOString(), cases, acceptancePassed: true,
    limitation: 'Read-only Chromium proof using an offline public placeholder, not an installed Freighter signature or live account setup.' }
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  process.stdout.write(JSON.stringify({ output, ...result }) + '\n')
} catch (error) {
  await writeFile(join(output, 'failure.json'), JSON.stringify({ checkedAtUTC: new Date().toISOString(), error: error.message, cases, acceptancePassed: false }, null, 2) + '\n', { flag: 'wx' })
  throw error
} finally {
  await browser.close()
}
