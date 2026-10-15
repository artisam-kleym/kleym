import { test, expect, type Page, type Request } from '@playwright/test'
import { Keypair } from '@stellar/stellar-sdk'
import { stellarMetadata } from '../src/lib/stellar/network'
import { splitCsvLine } from '../src/lib/campaign/csv'

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

// Wizard tests generate private material. Automatic artifacts must stay off;
// Playwright requires these worker-level settings at file scope.
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

test.describe('mobile sender navigation', () => {
  for (const width of [320, 393]) {
    test(`keeps every destination within the ${width}px screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 740 })
      await page.goto('/campaigns/new')
      await expect(page.getByLabel('Campaign name')).toBeVisible()
      const menuToggle = page.getByRole('button', { name: 'Menu', exact: true })
      await expect(menuToggle).toHaveAttribute('aria-expanded', 'false')
      const header = page.locator('header:visible')
      expect((await header.boundingBox())!.y).toBe(0)
      await menuToggle.click()
      const nav = page.locator('nav[aria-label="Main"]:visible')
      const links = nav.getByRole('link')
      // The seeded account is an administrator; its seventh destination is Admin.
      await expect(links).toHaveCount(7)
      for (const link of await links.all()) {
        await expect(link).toBeVisible()
        const box = await link.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width)
        expect(box!.y + box!.height).toBeLessThanOrEqual(740)
        expect(box!.height).toBeGreaterThanOrEqual(44)
      }
      await page.keyboard.press('Escape')
      await expect(menuToggle).toHaveAttribute('aria-expanded', 'false')
      // The top menu must not cover the last action when the page is scrolled.
      const next = page.getByTestId('next-step')
      await next.scrollIntoViewIfNeeded()
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const action = await next.boundingBox()
      const menu = await header.boundingBox()
      expect(action!.y).toBeGreaterThanOrEqual(menu!.y + menu!.height)
      expect(action!.y + action!.height).toBeLessThanOrEqual(740)
    })
  }
})

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
const ACCOUNT_BALANCES: { assetType: string; assetCode: string; assetIssuer: string | null; balance: string }[] = [
  { assetType: 'native', assetCode: 'XLM', assetIssuer: null, balance: '10000.0000000' },
  { assetType: 'credit_alphanum4', ...stellarMetadata('testnet').defaultAsset, balance: '10000.0000000' },
]

async function stubLookups(page: Page, balances = ACCOUNT_BALANCES) {
  await page.route('**/api/stellar/account*', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        exists: true,
        subentryCount: 0,
        balances,
      }),
    }),
  )
  await page.route('**/api/stellar/reserve', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ baseReserve: '0.5', claimantsPerLink: 2, reservePerLink: '1.5', sponsoredReservePerLink: '1' }),
    }),
  )
}

test.describe('campaign expiry controls', () => {
  async function reachExpiry(page: Page) {
    await stubLookups(page)
    await page.goto('/campaigns/new')
    await page.getByLabel('Campaign name').fill('Expiry preview')
    const accountChecked = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/stellar/account')
    await page.getByLabel('Funding account').fill(SENDER)
    await accountChecked
    await page.getByLabel('Amount per link', { exact: true }).fill('1')
    await expect(page.getByTestId('next-step')).toBeEnabled()
    await page.getByTestId('next-step').click()
  }

  test('selects a quick deadline and keeps it when returning from review', async ({ page }) => {
    await reachExpiry(page)
    await expect(page.getByRole('button', { name: '30 days', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: '1 hour', exact: true }).click()
    const deadline = await page.getByTestId('expiry-deadline').innerText()
    expect(deadline).toContain('UTC')
    await page.getByTestId('next-step').click()
    await expect(page.getByText(`Expiry: ${deadline}`, { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByTestId('expiry-deadline')).toHaveText(deadline)
    await expect(page.getByRole('button', { name: '1 hour', exact: true })).toHaveAttribute('aria-pressed', 'true')
    if (process.env.E2E_EVIDENCE_DIR) {
      await page.screenshot({ path: `${process.env.E2E_EVIDENCE_DIR}/expiry-desktop.png`, fullPage: true })
      await page.setViewportSize({ width: 390, height: 844 })
      await expect(page.getByRole('button', { name: 'Custom', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.screenshot({ path: `${process.env.E2E_EVIDENCE_DIR}/expiry-mobile.png`, fullPage: true })
    }
  })

  test('accepts typed custom dates and refuses incomplete or past deadlines', async ({ page }) => {
    await reachExpiry(page)
    await page.getByRole('button', { name: 'Custom', exact: true }).click()
    await page.getByLabel('Expiry date', { exact: true }).fill('2020-01-01')
    await expect(page.getByText('Choose an expiry in the future.', { exact: true })).toBeVisible()
    await expect(page.getByTestId('next-step')).toBeDisabled()
    await page.getByLabel('Expiry date', { exact: true }).fill('')
    await expect(page.getByText('Enter a complete expiry date and time.', { exact: true })).toBeVisible()
    await expect(page.getByTestId('next-step')).toBeDisabled()
    await page.getByLabel('Expiry date', { exact: true }).fill('2030-10-07')
    await page.getByLabel('Expiry time', { exact: true }).fill('18:30')
    await expect(page.getByTestId('next-step')).toBeEnabled()
    await expect(page.getByTestId('expiry-deadline')).toContainText('2030-10-07')
    const deadline = await page.getByTestId('expiry-deadline').innerText()
    await page.getByTestId('next-step').click()
    await expect(page.getByText(`Expiry: ${deadline}`, { exact: false })).toBeVisible()
  })

  test.describe('repeated clock hours', () => {
    test.use({ timezoneId: 'America/New_York' })
    test('retains the intended instant through a repeated daylight saving hour', async ({ page }) => {
      await page.clock.setFixedTime(new Date('2026-11-01T05:30:00Z'))
      await reachExpiry(page)
      await page.getByRole('button', { name: '1 hour', exact: true }).click()
      await expect(page.getByTestId('expiry-deadline')).toContainText('2026-11-01 06:30:00.000Z UTC')
      await expect(page.getByTestId('next-step')).toBeEnabled()
      const deadline = await page.getByTestId('expiry-deadline').innerText()
      await page.getByRole('button', { name: 'Custom', exact: true }).click()
      await expect(page.getByLabel('Expiry time', { exact: true })).toHaveValue('01:30')
      await expect(page.getByTestId('expiry-deadline')).toHaveText(deadline)
      await page.getByTestId('next-step').click()
      await expect(page.getByText(`Expiry: ${deadline}`, { exact: false })).toBeVisible()
    })
  })
})

test.describe('deployment asset identity (#96)', () => {
  test('refuses email-only policy during private CSV distribution', async ({ page }) => {
    await stubLookups(page)
    await page.goto('/campaigns/new')
    await page.getByLabel('Campaign name').fill('CSV pilot')
    await page.getByLabel('Funding account').fill(SENDER)
    await page.getByLabel('Amount per link').fill('1')
    await page.getByTestId('next-step').click()
    await expect(page.getByRole('radio', { name: /Email verification/ })).toBeDisabled()
    await expect(page.locator('input[name="claimPolicy"][value="open"]')).toBeChecked()
  })
  test('prices sponsor-paid USDC correctly for a zero-XLM sender', async ({ page }) => {
    await stubLookups(page, ACCOUNT_BALANCES.map((b) => ({ ...b, balance: b.assetCode === 'XLM' ? '0.0000000' : b.balance })))
    await page.goto('/campaigns/new')
    await page.getByLabel('Campaign name').fill('Sponsored pilot')
    await page.getByLabel('Funding account').fill(SENDER)
    await page.getByLabel('Amount per link').fill('1')
    await page.getByTestId('next-step').click()
    await page.getByLabel('Number of links').fill('3')
    await expect(page.getByText('Reserve is 1 XLM per link', { exact: false })).toBeVisible()
    await expect(page.getByText('Kleym pays this reserve and the network fees.', { exact: false })).toBeVisible()
    await expect(page.getByText('Not enough XLM', { exact: false })).toHaveCount(0)
    await page.getByTestId('next-step').click()
    await expect(page.getByText('Kleym reserve locked', { exact: true })).toBeVisible()
    await expect(page.getByText('3 XLM', { exact: true })).toBeVisible()
    await expect(page.getByText('0.0005 XLM', { exact: true })).toBeVisible()
  })
  test('locks the network and selects official USDC after hydration', async ({ page }) => {
    await stubLookups(page, [...ACCOUNT_BALANCES,
      { assetType: 'credit_alphanum4', assetCode: 'USDC', assetIssuer: Keypair.random().publicKey(), balance: '99999.0000000' },
    ])
    await page.goto('/campaigns/new')
    await page.getByLabel('Campaign name').fill('USDC identity check')
    await page.getByLabel('Funding account').fill(SENDER)
    await page.getByLabel('Amount per link', { exact: true }).fill('1.5')
    await expect(page.getByTestId('next-step')).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Testnet · test funds', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Mainnet · unavailable', exact: true })).toBeDisabled()
    await expect(page.getByLabel('Asset', { exact: true })).toHaveValue(`USDC:${stellarMetadata('testnet').defaultAsset.assetIssuer}`)
    await expect(page.locator('#asset option')).toHaveCount(2)
    await expect(page.getByText(stellarMetadata('testnet').valueNotice)).toBeVisible()
    if (process.env.E2E_EVIDENCE_DIR) {
      await page.screenshot({ path: `${process.env.E2E_EVIDENCE_DIR}/usdc-desktop.png`, fullPage: true })
      await page.setViewportSize({ width: 390, height: 844 })
      await expect(page.getByLabel('Asset', { exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.screenshot({ path: `${process.env.E2E_EVIDENCE_DIR}/usdc-mobile.png`, fullPage: true })
    }
  })

  test('keeps missing official USDC unavailable and allows explicit XLM', async ({ page }) => {
    await stubLookups(page, [ACCOUNT_BALANCES[0]!,
      { assetType: 'credit_alphanum4', assetCode: 'USDC', assetIssuer: Keypair.random().publicKey(), balance: '99999.0000000' },
    ])
    await page.goto('/campaigns/new')
    await page.getByLabel('Campaign name').fill('Missing official USDC')
    await page.getByLabel('Funding account').fill(SENDER)
    await page.getByLabel('Amount per link', { exact: true }).fill('1.5')
    await expect(page.getByRole('option', { name: /USDC — unavailable/ })).toHaveCount(1)
    await expect(page.getByTestId('next-step')).toBeDisabled()
    await expect(page.getByLabel('Asset', { exact: true })).toHaveValue(`USDC:${stellarMetadata('testnet').defaultAsset.assetIssuer}`)
    await page.getByLabel('Asset', { exact: true }).selectOption('XLM:')
    await expect(page.getByTestId('next-step')).toBeEnabled()
  })
})

/** Everything the page sent anywhere, so criterion 2 can be checked against it. */
function recordTraffic(page: Page): { requests: Request[] } {
  const requests: Request[] = []
  page.on('request', (request) => requests.push(request))
  return { requests }
}

async function reachExportStep(page: Page, policy: 'open' | 'code' = 'open') {
  await stubLookups(page)
  await page.goto('/campaigns/new')

  await page.getByLabel('Campaign name').fill('Gate test')
  await page.getByLabel('Funding account').fill(SENDER)
  await page.getByLabel('Amount per link').fill('1.5')

  const next = page.getByTestId('next-step')
  await expect(next).toBeEnabled({ timeout: 15_000 })
  await next.click()

  await page.getByLabel('Number of links').fill('3')
  await page.locator(`input[name="claimPolicy"][value="${policy}"]`).check()
  await expect(next).toBeEnabled()
  await next.click()

  await expect(page.getByRole('heading', { name: /review & create/i })).toBeVisible()
  // Review must show the selected count before any private keys are generated.
  await expect(page.getByTestId('review-link-count')).toHaveText('3')
}

/**
 * The recovery phrase (#77) comes before the keys: generate is disabled until
 * it is confirmed. Returns the twelve words as shown, so a test can assert
 * they went nowhere.
 */
async function confirmPhrase(page: Page): Promise<string[]> {
  await page.getByTestId('phrase-new').click()
  const words = await page.getByTestId('phrase-words').locator('li').allInnerTexts()
  await page.getByTestId('phrase-stored').check()
  await page.getByTestId('phrase-understood').check()
  await page.getByTestId('phrase-confirm').click()
  return words.map((w) => w.replace(/^\d+\.\s*/, '').trim())
}

test.describe('code-protected CSV export', () => {
  for (const width of [320, 1440]) {
    test(`exports one code per link and preserves the save gate at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const traffic = recordTraffic(page)
      await reachExportStep(page, 'code')
      await expect(
        page.getByTestId('claim-code-export-guidance'),
      ).toContainText('separate channel')
      await confirmPhrase(page)
      await page.getByTestId('generate-keys').click()
      await expect(
        page.getByTestId('claim-code-export-guidance'),
      ).toContainText('All 3 links have codes ready')
      await expect(page.getByTestId('sign-batches')).toBeDisabled()
      const download = page.waitForEvent('download')
      await page.getByTestId('download-secrets').click()
      const file = await download
      const stream = await file.createReadStream()
      expect(stream !== null).toBe(true)
      const chunks: Buffer[] = []
      for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
      const rows = Buffer.concat(chunks)
        .toString('utf8')
        .trimEnd()
        .split('\n')
        .map(splitCsvLine)
      expect(rows.length).toBe(4)
      expect(rows[0]![8]).toBe('claim_code')
      const codes = rows.slice(1).map((row) => row[8]!)
      expect(
        codes.every((code) => /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{13}$/.test(code)),
      ).toBe(true)
      expect(new Set(codes).size).toBe(3)
      expect(rows.slice(1).every((row) => !row[3]!.includes(row[8]!))).toBe(
        true,
      )
      const sent = traffic.requests
        .map((request) => request.url() + (request.postData() ?? ''))
        .join('\n')
      expect(rows.slice(1).every((row) => !sent.includes(row[2]!))).toBe(true)
      await expect(page.getByTestId('sign-batches')).toBeDisabled()
      await page.getByTestId('confirm-export-saved').check()
      await expect(page.getByTestId('sign-batches')).toBeEnabled()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      // Stop before signing: no wallet approval, API registration or ledger write.
    })
  }
})

test.describe('recovery phrase (#77)', () => {
  test('keys cannot be generated before the phrase is confirmed, and the trade is stated', async ({ page }) => {
    await reachExportStep(page)
    const generate = page.getByTestId('generate-keys')
    await expect(generate).toBeDisabled()

    await page.getByTestId('phrase-new').click()
    await expect(page.getByTestId('phrase-words').locator('li')).toHaveCount(12)
    // Concentration of risk, said plainly, before the sender can continue.
    await expect(page.getByText(/every campaign made from it is exposed at once/i)).toBeVisible()
    await expect(page.getByTestId('phrase-confirm')).toBeDisabled()

    await page.getByTestId('phrase-stored').check()
    await expect(page.getByTestId('phrase-confirm')).toBeDisabled()
    await page.getByTestId('phrase-understood').check()
    await page.getByTestId('phrase-confirm').click()
    await expect(generate).toBeEnabled()
  })

  test('the phrase appears in no request, no storage and no server-rendered payload', async ({ page }) => {
    const traffic = recordTraffic(page)
    await reachExportStep(page)
    const words = await confirmPhrase(page)
    expect(words).toHaveLength(12)
    const phrase = words.join(' ')

    await page.getByTestId('generate-keys').click()
    await expect(page.getByTestId('download-secrets')).toBeVisible()
    const download = page.waitForEvent('download')
    await page.getByTestId('download-secrets').click()
    await download

    // Four consecutive words is not a coincidence; one word is — "link",
    // "page", "next" and "chunk" are all in the wordlist and in ordinary URLs.
    const runs = Array.from({ length: words.length - 3 }, (_, i) => words.slice(i, i + 4))
    const holdsRun = (text: string) => {
      let decoded = text
      try {
        decoded = decodeURIComponent(text)
      } catch {
        // Not percent-encoded; the raw text is what there is to check.
      }
      return runs.some((run) => new RegExp(`\\b${run.join('[^a-z]+')}\\b`).test(decoded.toLowerCase()))
    }
    for (const request of traffic.requests) {
      expect(holdsRun(request.url()), `phrase in URL ${request.url()}`).toBe(false)
      const body = request.postData()
      if (body) {
        expect(body, `phrase in body to ${request.url()}`).not.toContain(phrase)
        expect(holdsRun(body), `phrase run in body to ${request.url()}`).toBe(false)
      }
    }

    const stored = await page.evaluate(() => ({
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
      cookie: document.cookie,
      url: window.location.href,
      // The RSC flight payload and anything else server-rendered into the document.
      html: document.documentElement.outerHTML,
    }))
    for (const where of [stored.local, stored.session, stored.cookie, stored.url]) {
      expect(where).not.toContain(phrase)
    }
    // The words are on screen only inside the panel while it is open; it closed on confirm.
    expect(stored.html).not.toContain(phrase)
  })
})

test.describe('CSV gate', () => {
  test('Android creator confirms a readable private CSV before funding', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 })
    await reachExportStep(page)
    await confirmPhrase(page)
    await page.getByTestId('generate-keys').click()
    const sign = page.getByTestId('sign-batches')
    await expect(page.getByTestId('confirm-export-saved')).toHaveCount(0)
    await expect(sign).toBeDisabled()
    const download = page.waitForEvent('download')
    await page.getByTestId('download-secrets').click()
    const file = await download
    expect(await file.failure()).toBeNull()
    const stream = await file.createReadStream()
    expect(stream).not.toBeNull()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    // Inspect locally; never print, persist or send the bearer export.
    const rows = Buffer.concat(chunks).toString('utf8').trim().split('\n')
    expect(rows).toHaveLength(4)
    await expect(sign).toBeDisabled()
    await expect(page.getByTestId('download-state')).toContainText('Check your browser downloads or Files app')
    await page.getByTestId('confirm-export-saved').check()
    await expect(sign).toBeEnabled()
    await page.getByTestId('confirm-export-saved').uncheck()
    await expect(sign).toBeDisabled()
  })
  test('signing is unreachable until the export has fired', async ({ page }) => {
    await reachExportStep(page)

    // 1 — the checkpoint is shown before anything is generated.
    await expect(page.getByText(/we cannot recover them for you if lost/i)).toBeVisible()
    await expect(page.getByTestId('download-secrets')).toHaveCount(0)

    // 2 — the phrase, then generate.
    await confirmPhrase(page)
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
    await expect(sign).toBeDisabled()
    await page.getByTestId('confirm-export-saved').check()
    await expect(sign).toBeEnabled()
  })

  test('no seed leaves the browser', async ({ page }) => {
    const traffic = recordTraffic(page)
    await reachExportStep(page)

    await confirmPhrase(page)
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

    await confirmPhrase(page)
    await page.getByTestId('generate-keys').click()
    const download = page.waitForEvent('download')
    await page.getByTestId('download-secrets').click()
    await download

    await page.getByTestId('confirm-export-saved').check()
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


test.describe('wallet-bound recipient CSV', () => {
  for (const width of [320, 1440]) {
    test(`imports ordered wallets, prizes and safe template at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await stubLookups(page)
      await page.goto('/campaigns/new')
      await page.getByLabel('Campaign name').fill('Wallet CSV test')
      await page.getByLabel('Funding account').fill(SENDER)
      await page.getByLabel('Amount per link').fill('5')
      await page.getByTestId('next-step').click()
      await page.locator('input[name="claimPolicy"][value="wallet"]').check()
      await expect(page.getByTestId('next-step')).toBeDisabled()
      const downloadEvent = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download CSV template', exact: true }).click()
      const download = await downloadEvent
      const stream = await download.createReadStream()
      const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
      const header = Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0]!
      expect(header).toBe('label,public_key,secret,claim_url,reference,category,note,amount,claim_code,Wallet Address')
      const wallets = Array.from({ length: 5 }, () => Keypair.random().publicKey())
      const upload = (body: string, name = 'workers.csv') => page.getByLabel('Insert recipient CSV', { exact: true }).setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(body) })
      await upload(header + '\nWorker,,,,,,,20,,not-an-address')
      await expect(page.getByRole('alert').filter({ hasText: 'valid Stellar G-address' })).toBeVisible()
      await expect(page.getByTestId('next-step')).toBeDisabled()
      await upload([header, ...wallets.map((wallet, i) => [`Worker ${i + 1}`, '', '', '', '', '', '', ['20', '15', '10', '', ''][i], '', wallet].join(','))].join('\r\n'))
      await expect(page.getByLabel('Number of links')).toHaveValue('5')
      await expect(page.getByLabel('Number of links')).toBeDisabled()
      const items = page.locator('ol li').filter({ hasText: /Link [1-5]/ })
      await expect(items).toHaveCount(5)
      for (let index = 0; index < 5; index++) await expect(items.nth(index)).toContainText(wallets[index]!)
      await expect(page.getByLabel('Prize for Worker 1 (link 1) in USDC')).toHaveValue('20')
      await expect(page.getByLabel('Prize for Worker 2 (link 2) in USDC')).toHaveValue('15')
      await page.getByLabel('Prize for Worker 4 (link 4) in USDC').fill('7')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await expect(page.getByTestId('next-step')).toBeEnabled()
      await page.getByTestId('next-step').click()
      await expect(page.getByTestId('review-link-count')).toHaveText('5')
      await expect(page.getByText('Wallet-bound claims:', { exact: false })).toBeVisible()
      await expect(page.getByLabel('Prize for Worker 4 (link 4) in USDC')).toHaveValue('7')
      if (process.env.E2E_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.E2E_EVIDENCE_DIR}/wallet-review-${width}.png`, fullPage: true })
      await page.getByRole('button', { name: 'Back', exact: true }).click()
      await upload(header + '\n', 'workers.xlsx')
      await expect(page.getByRole('alert').filter({ hasText: 'Insert a CSV file.' })).toBeVisible()
      await expect(page.getByTestId('next-step')).toBeDisabled()
      await page.locator('input[name="claimPolicy"][value="open"]').check()
      await expect(page.getByTestId('next-step')).toBeEnabled()
      await expect(page.getByLabel('Number of links')).toBeEnabled()
    })
  }
})
