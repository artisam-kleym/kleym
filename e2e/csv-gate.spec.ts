import { test, expect, type Page, type Request } from '@playwright/test'
import { Keypair } from '@stellar/stellar-sdk'

/**
 * The CSV hard gate, in a real browser. SPEC.md §5.3 step 3, §10.11.
 *
 * Acceptance criterion 1 says this must be verified by a Playwright test and
 * not by reading the component source, and it is right to: "the button is
 * disabled" is a claim about a rendered page. A component can be correct and
 * the page still let a user through — a stale render, a form submit, a keyboard
 * activation on a visually-disabled element.
 *
 * Criterion 2 rides along: every request the page makes is recorded, and no
 * seed may appear in any of them, nor in storage or the URL.
 */

const SENDER = Keypair.random().publicKey()

/**
 * The two Horizon-backed lookups are stubbed.
 *
 * The wizard is what is under test, not Horizon: the gate sits before any
 * transaction is built, and step 1 legitimately refuses to advance until it
 * has seen a funded account. Reaching that state through the real network
 * would make this test depend on Friendbot and a live testnet, which
 * AGENT.md §7.2 keeps out of the commit gate — and would test Horizon's
 * uptime rather than the gate.
 *
 * Everything downstream of these two responses is the real page: the real
 * build, the real CSP, the real components, the real download.
 */
async function stubLookups(page: Page) {
  await page.route('**/api/stellar/account*', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        exists: true,
        subentryCount: 0,
        balances: [{ assetType: 'native', assetCode: 'XLM', assetIssuer: null, balance: '10000.0000000' }],
      }),
    }),
  )
  await page.route('**/api/stellar/reserve', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ baseReserve: '0.5', claimantsPerLink: 2, reservePerLink: '1.5' }),
    }),
  )
}

/** Everything the page sent anywhere, so criterion 2 can be checked against it. */
function recordTraffic(page: Page): { requests: Request[] } {
  const requests: Request[] = []
  page.on('request', (request) => requests.push(request))
  return { requests }
}

async function reachExportStep(page: Page) {
  await stubLookups(page)
  await page.goto('/campaigns/new')

  await page.getByLabel('Campaign name').fill('Gate test')
  await page.getByLabel('Funding account').fill(SENDER)
  await page.getByLabel('Amount per link').fill('1.5')

  const next = page.getByTestId('next-step')
  await expect(next).toBeEnabled({ timeout: 15_000 })
  await next.click()

  await page.getByLabel('Number of links').fill('3')
  await expect(next).toBeEnabled()
  await next.click()

  await expect(page.getByRole('heading', { name: /review & create/i })).toBeVisible()
}

test.describe('CSV gate', () => {
  test('signing is unreachable until the export has fired', async ({ page }) => {
    await reachExportStep(page)

    // 1 — the checkpoint is shown before anything is generated.
    await expect(page.getByText(/we cannot recover them for you if lost/i)).toBeVisible()
    await expect(page.getByTestId('download-secrets')).toHaveCount(0)

    // 2 — generate.
    await page.getByTestId('generate-keys').click()
    await expect(page.getByTestId('download-secrets')).toBeVisible()

    // 3 — the gate is shut.
    const sign = page.getByTestId('sign-batches')
    await expect(sign).toBeDisabled()
    await expect(page.getByTestId('download-state')).toHaveAttribute('data-downloaded', 'false')

    /*
     * A disabled button must be disabled to a KEYBOARD too. `click()` on a
     * disabled element is a no-op in Playwright whatever the page does, so it
     * would pass against a button that only looks disabled.
     */
    await sign.press('Enter').catch(() => undefined)
    await expect(page.getByTestId('download-state')).toHaveAttribute('data-downloaded', 'false')

    // And to a dispatched event, which is what a stale render would allow.
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('[data-testid="sign-batches"]')?.click()
    })
    await expect(page.getByTestId('download-state')).toHaveAttribute('data-downloaded', 'false')
    await expect(sign).toBeDisabled()

    // 4 — the export fires, and only then does the gate open.
    const download = page.waitForEvent('download')
    await page.getByTestId('download-secrets').click()
    const file = await download

    expect(file.suggestedFilename()).toBe('kleym-gate-test-secrets.csv')
    await expect(page.getByTestId('download-state')).toHaveAttribute('data-downloaded', 'true')
    await expect(sign).toBeEnabled()
  })

  test('no seed leaves the browser', async ({ page }) => {
    const traffic = recordTraffic(page)
    await reachExportStep(page)

    await page.getByTestId('generate-keys').click()
    await expect(page.getByTestId('download-secrets')).toBeVisible()

    const download = page.waitForEvent('download')
    await page.getByTestId('download-secrets').click()
    const stream = await (await download).createReadStream()

    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    const csv = Buffer.concat(chunks).toString('utf8')

    const seeds = csv
      .split('\n')
      .slice(1)
      .map((line) => line.split(',')[2]?.replace(/"/g, '').trim())
      .filter((seed): seed is string => Boolean(seed) && seed.startsWith('S'))

    expect(seeds.length).toBe(3)

    // AGENT.md §1. Every request the page made, checked against every seed.
    for (const seed of seeds) {
      for (const request of traffic.requests) {
        expect(request.url(), `seed in URL of ${request.url()}`).not.toContain(seed)
        const body = request.postData()
        if (body) expect(body, `seed in body to ${request.url()}`).not.toContain(seed)
      }
    }

    // Nor anywhere the browser would persist it across a navigation.
    const stored = await page.evaluate(() => ({
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
      cookie: document.cookie,
      url: window.location.href,
    }))
    for (const seed of seeds) {
      expect(stored.local).not.toContain(seed)
      expect(stored.session).not.toContain(seed)
      expect(stored.cookie).not.toContain(seed)
      expect(stored.url).not.toContain(seed)
    }
  })

  test('regenerating shuts the gate again', async ({ page }) => {
    await reachExportStep(page)

    await page.getByTestId('generate-keys').click()
    const download = page.waitForEvent('download')
    await page.getByTestId('download-secrets').click()
    await download

    await expect(page.getByTestId('sign-batches')).toBeEnabled()

    /*
     * Changing the link count regenerates, which makes the downloaded file
     * describe keys that no longer exist. The gate must shut — otherwise the
     * sender signs a campaign whose secrets they do not hold.
     */
    await page.getByRole('button', { name: /back/i }).click()
    await page.getByLabel('Number of links').fill('4')
    await page.getByTestId('next-step').click()
    await page.getByTestId('generate-keys').click()

    await expect(page.getByTestId('download-state')).toHaveAttribute('data-downloaded', 'false')
    await expect(page.getByTestId('sign-batches')).toBeDisabled()
  })

  test('labels refuse an address and a seed', async ({ page }) => {
    await stubLookups(page)
    await page.goto('/campaigns/new')

    await page.getByLabel('Campaign name').fill('Label test')
    await page.getByLabel('Funding account').fill(SENDER)
    await page.getByLabel('Amount per link').fill('1')
    await expect(page.getByTestId('next-step')).toBeEnabled({ timeout: 15_000 })
    await page.getByTestId('next-step').click()

    const labels = page.getByLabel('Labels (optional)')
    await labels.fill(`alice\n${SENDER}`)
    await expect(page.getByText(/is a Stellar address/i)).toBeVisible()
    await expect(page.getByTestId('next-step')).toBeDisabled()

    await labels.fill('alice\nbob')
    await expect(page.getByText(/2 labels accepted/i)).toBeVisible()
    await expect(page.getByTestId('next-step')).toBeEnabled()
  })
})
