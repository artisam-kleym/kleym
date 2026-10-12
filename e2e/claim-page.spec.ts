import { test, expect, type Page, type Request } from '@playwright/test'
import { Keypair } from '@stellar/stellar-sdk'
import { prepareProofMessage } from '../src/lib/claim/prepare-proof'

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

test.describe('Android wallet connection UI', () => {
  test.skip(!process.env.MOBILE_WALLET_E2E, 'Requires the configured mobile production fixture server')
  test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' })

  test('pairs through the bundled SDK at phone width, without committing funds, and cancels safely', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Deep-link navigation instrumentation uses Chromium CDP; actual Android Chrome remains covered.')
    await page.setViewportSize({ width: 393, height: 851 })
    const posts: string[] = []
    const requests = record(page)
    page.on('request', (r) => { if (r.method() === 'POST' && new URL(r.url()).pathname.startsWith('/api/claims/')) posts.push(r.url()) })
    // Local relay fixture: no external relay, real wallet or ledger traffic.
    await page.routeWebSocket(/relay\.walletconnect\.org/, (socket) => {
      socket.onMessage((raw) => {
        const message = JSON.parse(String(raw))
        if (!message.id) return
        const result = message.method === 'irn_subscribe' ? 'fixture-subscription'
          : message.method === 'irn_batchSubscribe' ? message.params.topics.map(() => 'fixture-subscription') : true
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
      })
    })
    await page.route('https://verify.walletconnect.org/**', (route) => {
      const id = new URL(route.request().url()).searchParams.get('id')
      const jwt = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ id })).toString('base64url')}.fixture`
      return route.fulfill({ contentType: 'text/html', body: `<script>parent.postMessage(JSON.stringify({type:'verify_attestation',attestation:${JSON.stringify(jwt)}}),'*')</script>` })
    })
    await stubResolve(page, CLAIMABLE)
    await page.goto(`/claim#s=${SEED}`)
    await expect(page.getByTestId('claim-connect-mobile')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Connect Freighter', exact: true })).toHaveCount(0)
    expect(requests.filter((r) => !r.url().startsWith(new URL(page.url()).origin))).toEqual([])
    const navigation = await page.context().newCDPSession(page)
    await navigation.send('Page.enable')
    const launchAttempts: string[] = []
    navigation.on('Page.frameRequestedNavigation', ({ url }) => { if (url.startsWith('freighterwallet:')) launchAttempts.push(url) })
    await page.getByTestId('claim-connect-mobile').click()
    const open = page.getByTestId('open-freighter')
    await expect(open).toBeVisible({ timeout: 20_000 })
    const appLink = new URL((await open.getAttribute('href'))!)
    expect(appLink.protocol).toBe('freighterwallet:')
    expect(appLink.host).toBe('wc-redirect')
    expect(appLink.searchParams.get('uri')).toMatch(/^wc:/)
    expect(appLink.href).not.toContain(SEED)
    await expect.poll(() => launchAttempts.length).toBe(1)
    expect(new URL(launchAttempts[0]).searchParams.get('uri')).toBe(appLink.searchParams.get('uri'))
    await open.click()
    await expect.poll(() => launchAttempts.length).toBe(2)
    expect(launchAttempts[1]).toBe(launchAttempts[0])
    await expect(page.getByLabel('Wallet connection code')).toBeHidden()
    await page.getByText('Freighter did not open?', { exact: true }).click()
    await expect(page.getByLabel('Wallet connection code')).toBeVisible()
    expect(await page.getByLabel('Wallet connection code').inputValue()).toMatch(/^wc:/)
    await expect(page.getByText('Select Testnet in Freighter', { exact: false })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(posts).toEqual([])
    for (const request of requests) {
      expect(request.url()).not.toContain(SEED)
      expect(request.postData() ?? '').not.toContain(SEED)
    }
    await page.getByRole('button', { name: 'Cancel connection' }).click()
    await expect(page.getByTestId('claim-connect-mobile')).toBeVisible()
    await expect(page.getByLabel('Wallet connection code')).toHaveCount(0)
    expect(posts).toEqual([])
  })
})

test('a narrow desktop keeps extension connection available', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 })
  await stubResolve(page, CLAIMABLE)
  await page.goto(`/claim#s=${SEED}`)
  await expect(page.getByRole('button', { name: 'Connect Freighter', exact: true })).toBeVisible()
  await expect(page.getByTestId('claim-connect-mobile')).toHaveCount(0)
})

/** Browser bridge fixture for the installed Freighter API. It never signs. */
async function stubWallet(page: Page, address: string) {
  await page.addInitScript(({ address }) => {
    const fixture = window as unknown as { freighter: boolean; walletFixtureAddress: string }
    fixture.freighter = true
    fixture.walletFixtureAddress = address
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data?.source !== 'FREIGHTER_EXTERNAL_MSG_REQUEST') return
      const data = event.data
      window.postMessage({ source: 'FREIGHTER_EXTERNAL_MSG_RESPONSE', messagedId: data.messageId,
        isConnected: true, publicKey: fixture.walletFixtureAddress,
        networkDetails: { network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' },
      }, window.location.origin)
    })
  }, { address })
}

test.describe('deliberate claim commitment', () => {
  test('opening and connecting submit nothing; a separate claim starts preparation', async ({ page }) => {
    const address = Keypair.random().publicKey()
    await stubWallet(page, address)
    await stubResolve(page, CLAIMABLE)
    const posts: string[] = []
    page.on('request', (r) => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname) })
    await page.route('**/api/claims/prepare/materialise', (route) => {
      const request = route.request(), headers = request.headers(), expires = Number(headers['x-kleym-proof-expires'])
      const bytes = Buffer.from(prepareProofMessage(new URL(request.url()).origin, 'testnet', 'materialise', expires, request.postDataJSON()))
      expect(Keypair.fromPublicKey(PUBLIC_KEY).verify(bytes, Buffer.from(headers['x-kleym-link-proof'], 'base64'))).toBe(true)
      expect(request.postData()).not.toContain(SEED)
      return route.fulfill({ status: 409, contentType: 'application/problem+json', body: JSON.stringify({ detail: 'Fixture stops before signing', status: 409 }) })
    })
    await page.goto(`/claim#s=${SEED}`)
    await page.getByTestId('claim-connect').click()
    await expect(page.getByTestId('claim-connect')).toHaveText('Claim 500 USDC')
    await expect(page.getByText(`Destination: ${address}`)).toBeVisible()
    await expect(page.getByTestId('claim-connect-mobile')).toHaveCount(0)
    expect(posts).toEqual([])
    await page.getByTestId('claim-connect').click()
    await expect.poll(() => posts).toEqual(['/api/claims/prepare/materialise'])
  })

  test('a wallet change after destination review refuses before materialisation', async ({ page }) => {
    await stubWallet(page, Keypair.random().publicKey())
    await stubResolve(page, CLAIMABLE)
    const posts: string[] = []
    page.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url()) })
    await page.goto(`/claim#s=${SEED}`)
    await page.getByTestId('claim-connect').click()
    await expect(page.getByTestId('claim-connect')).toHaveText('Claim 500 USDC')
    await page.evaluate((address) => { (window as unknown as { walletFixtureAddress: string }).walletFixtureAddress = address }, Keypair.random().publicKey())
    await page.getByTestId('claim-connect').click()
    await expect(page.getByTestId('ready-error')).toContainText('wallet account changed')
    expect(posts).toEqual([])
    await expect(page.getByTestId('claim-connect')).toHaveText('Connect Freighter')
  })

  test('claim preparation carries a holder signature bound to its reviewed destination', async ({ page }) => {
    const address = Keypair.random().publicKey()
    await stubWallet(page, address)
    await stubResolve(page, CLAIMABLE)
    await page.route('**/api/claims/prepare/materialise', (route) => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ alreadyExists: true, xdr: null, operations: 0 }) }))
    let verified = false
    await page.route('**/api/claims/prepare/claim', (route) => {
      const request = route.request(), input = request.postDataJSON(), headers = request.headers()
      expect(input.recipientPublicKey).toBe(address)
      const message = prepareProofMessage(new URL(request.url()).origin, 'testnet', 'claim', Number(headers['x-kleym-proof-expires']), input)
      verified = Keypair.fromPublicKey(PUBLIC_KEY).verify(Buffer.from(message), Buffer.from(headers['x-kleym-link-proof'], 'base64'))
      expect(verified).toBe(true)
      expect(request.postData()).not.toContain(SEED)
      return route.fulfill({ status: 409, contentType: 'application/problem+json', body: JSON.stringify({ detail: 'Fixture stops before signing', status: 409 }) })
    })
    await page.goto(`/claim#s=${SEED}`)
    await page.getByTestId('claim-connect').click()
    await expect(page.getByTestId('claim-connect')).toHaveText('Claim 500 USDC')
    await page.getByTestId('claim-connect').click()
    await expect.poll(() => verified).toBe(true)
  })

  test('real preparation endpoints refuse public-key-only requests before lookup or reservation', async ({ page }) => {
    await page.goto('/claim')
    const results = await page.evaluate(async ({ ephemeralPublicKey, recipientPublicKey }) => {
      return Promise.all(['materialise', 'claim'].map(async (phase) => {
        const response = await fetch(`/api/claims/prepare/${phase}`, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ephemeralPublicKey, ...(phase === 'claim' ? { recipientPublicKey } : {}) }) })
        return { status: response.status, detail: (await response.json()).detail }
      }))
    }, { ephemeralPublicKey: PUBLIC_KEY, recipientPublicKey: Keypair.random().publicKey() })
    expect(results).toEqual([{ status: 409, detail: expect.stringContaining('Reopen your saved claim link') },
      { status: 409, detail: expect.stringContaining('Reopen your saved claim link') }])
  })
})

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
