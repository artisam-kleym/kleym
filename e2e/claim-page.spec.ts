import { test, expect, type Page, type Request } from '@playwright/test'
import { Keypair } from '@stellar/stellar-sdk'

/**
 * `/claim` — the hardened surface. SPEC.md §3.6, §5.1, §10 (7, 8, 12).
 *
 * These are the acceptance criteria that cannot be checked any other way: what
 * the page loads, what leaves it, and whether the fragment survives. A
 * component reading correctly proves none of them.
 *
 * Runs against a production build, so the CSP under test is the real one.
 */

const SEED = Keypair.random().secret()
const PUBLIC_KEY = Keypair.fromSecret(SEED).publicKey()

/** Everything the page asked the network for. */
function record(page: Page): Request[] {
  const requests: Request[] = []
  page.on('request', (request) => requests.push(request))
  return requests
}

/** Resolve, stubbed, so these tests need no database state. */
async function stubResolve(page: Page, body: Record<string, unknown>) {
  await page.route('**/api/claims/resolve*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  )
}

const CLAIMABLE = {
  status: 'claimable',
  assetCode: 'USDC',
  assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  amount: '500',
  senderName: 'Acme',
  expiresAt: '2027-01-01T00:00:00.000Z',
  network: 'testnet',
}

const UNAVAILABLE = {
  status: 'unavailable',
  assetCode: null, assetIssuer: null, amount: null,
  senderName: null, expiresAt: null, network: null,
}

test.describe('hardened surface', () => {
  test('loads zero third-party requests', async ({ page }) => {
    const requests = record(page)
    await stubResolve(page, CLAIMABLE)

    await page.goto(`/claim#s=${SEED}`)
    await expect(page.getByTestId('claim-connect')).toBeVisible()

    const origin = new URL(page.url()).origin
    const foreign = requests
      .map((r) => r.url())
      .filter((url) => !url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:'))

    expect(foreign, `third-party requests: ${foreign.join(', ')}`).toEqual([])
  })

  test('sends Referrer-Policy: no-referrer and a CSP with no unsafe directives', async ({ page }) => {
    await stubResolve(page, CLAIMABLE)
    const response = await page.goto(`/claim#s=${SEED}`)
    const headers = response!.headers()

    expect(headers['referrer-policy']).toBe('no-referrer')

    const csp = headers['content-security-policy'] ?? ''
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).toContain("default-src 'self'")
  })

  /*
   * The page must HYDRATE, not merely return 200. #6 shipped a CSP that
   * refused every script while the route still answered 200 — a status code
   * cannot tell you. Reaching `ready` requires the client to have read the
   * fragment, derived a key and completed a fetch.
   */
  test('hydrates under the real CSP', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await stubResolve(page, CLAIMABLE)

    await page.goto(`/claim#s=${SEED}`)
    await expect(page.getByTestId('claim-connect')).toBeVisible()

    const cspViolations = errors.filter((e) => /Content Security Policy|Refused to/i.test(e))
    expect(cspViolations, cspViolations.join(' | ')).toEqual([])
  })
})

test.describe('the fragment', () => {
  test('is removed from the URL and appears in no request, cookie or storage', async ({ page }) => {
    const requests = record(page)
    await stubResolve(page, CLAIMABLE)

    await page.goto(`/claim#s=${SEED}`)
    await expect(page.getByTestId('claim-connect')).toBeVisible()

    // SPEC.md §3.6 — history.replaceState after reading.
    expect(page.url()).not.toContain(SEED)
    expect(new URL(page.url()).hash).toBe('')

    for (const request of requests) {
      expect(request.url(), `seed in URL ${request.url()}`).not.toContain(SEED)
      const body = request.postData()
      if (body) expect(body, `seed in body to ${request.url()}`).not.toContain(SEED)
    }

    const stored = await page.evaluate(() => ({
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
      cookie: document.cookie,
      html: document.documentElement.outerHTML,
    }))
    expect(stored.local).not.toContain(SEED)
    expect(stored.session).not.toContain(SEED)
    expect(stored.cookie).not.toContain(SEED)
    // Not rendered into the DOM either — a screenshot or a bug report would carry it.
    expect(stored.html).not.toContain(SEED)
  })

  /* The PUBLIC key is what may cross the wire, and does — resolve takes it. */
  test('sends the public key, never the secret', async ({ page }) => {
    const requests = record(page)
    await stubResolve(page, CLAIMABLE)

    await page.goto(`/claim#s=${SEED}`)
    await expect(page.getByTestId('claim-connect')).toBeVisible()

    const resolve = requests.find((r) => r.url().includes('/api/claims/resolve'))
    expect(resolve, 'resolve was not called').toBeTruthy()
    expect(resolve!.url()).toContain(PUBLIC_KEY)
    expect(resolve!.url()).not.toContain(SEED)
  })
})

test.describe('states', () => {
  test('a claimable link reaches ready and shows the amount', async ({ page }) => {
    await stubResolve(page, CLAIMABLE)
    await page.goto(`/claim#s=${SEED}`)

    await expect(page.getByTestId('claim-state')).toHaveText('ready')
    await expect(page.getByText('500')).toBeVisible()
    await expect(page.getByText('USDC')).toBeVisible()
    await expect(page.getByText(/Acme sent you/)).toBeVisible()
    await expect(page.getByText(/New to Stellar/)).toBeVisible()
  })

  test('an unavailable link reaches invalid', async ({ page }) => {
    await stubResolve(page, UNAVAILABLE)
    await page.goto(`/claim#s=${SEED}`)
    await expect(page.getByTestId('claim-state')).toHaveText('invalid')
    await expect(page.getByText(/not valid/i)).toBeVisible()
  })

  test('a malformed fragment reaches invalid without calling the API', async ({ page }) => {
    const requests = record(page)
    await page.goto('/claim#s=not-a-seed')

    await expect(page.getByTestId('claim-state')).toHaveText('invalid')
    expect(requests.filter((r) => r.url().includes('/api/claims/'))).toEqual([])
  })

  test('no fragment at all reaches invalid', async ({ page }) => {
    await page.goto('/claim')
    await expect(page.getByTestId('claim-state')).toHaveText('invalid')
  })
})

test.describe('accessibility', () => {
  test('announces state changes through a live region', async ({ page }) => {
    await stubResolve(page, CLAIMABLE)
    await page.goto(`/claim#s=${SEED}`)

    const live = page.getByTestId('claim-state')
    await expect(live).toHaveAttribute('aria-live', 'polite')
    await expect(live).toHaveText('ready')
  })

  test('the claim button is reachable and operable by keyboard', async ({ page }) => {
    await stubResolve(page, CLAIMABLE)
    await page.goto(`/claim#s=${SEED}`)
    await expect(page.getByTestId('claim-connect')).toBeVisible()

    await page.getByTestId('claim-connect').focus()
    await expect(page.getByTestId('claim-connect')).toBeFocused()
  })

  test('has one h1 and a main landmark', async ({ page }) => {
    await stubResolve(page, CLAIMABLE)
    await page.goto(`/claim#s=${SEED}`)

    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('main')).toHaveCount(1)
  })

  /* BRAND.md §7 / criterion 8 — decorative motion off under reduced motion. */
  test('stops the decorative pulse under prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await stubResolve(page, CLAIMABLE)
    await page.goto(`/claim#s=${SEED}`)
    await expect(page.getByTestId('claim-connect')).toBeVisible()

    const animated = await page.evaluate(() =>
      [...document.querySelectorAll('*')].filter((el) => {
        const name = getComputedStyle(el).animationName
        return name && name !== 'none'
      }).length,
    )
    expect(animated).toBe(0)
  })
})

test.describe('voice', () => {
  /* BRAND.md §8 — this audience did not choose to be here. */
  test('uses no jargon a recipient would not know', async ({ page }) => {
    await stubResolve(page, CLAIMABLE)
    await page.goto(`/claim#s=${SEED}`)
    await expect(page.getByTestId('claim-connect')).toBeVisible()

    const text = (await page.locator('body').innerText()).toLowerCase()
    for (const word of ['crypto', 'web3', 'dapp', 'non-custodial', 'protocol', 'blockchain']) {
      expect(text, `"${word}" is on the page`).not.toContain(word)
    }
    expect(text).not.toContain('success!')
  })
})
