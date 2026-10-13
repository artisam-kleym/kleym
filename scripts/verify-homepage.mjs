import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Public, read-only checks. No login, wallet requests, campaign creation or secrets.
const base = new URL(process.argv[2] ?? 'http://127.0.0.1:3226')
assert(
  base.protocol === 'https:' ||
    ['localhost', '127.0.0.1'].includes(base.hostname),
)
const out = resolve(process.argv[3] ?? '.runtime/homepage-verification')
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []
const failures = []
const profiles = [
  { name: 'phone-320', width: 320, height: 800 },
  { name: 'android-393', width: 393, height: 852, phone: true },
  { name: 'phone-landscape', width: 852, height: 393, phone: true },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1024', width: 1024, height: 768 },
  { name: 'desktop-compact-1280', width: 1280, height: 576 },
  { name: 'desktop-1440', width: 1440, height: 1000 },
  { name: 'wide-1920', width: 1920, height: 1080 },
  // Narrow effective viewport represents 200% zoom on a 1280px desktop.
  { name: 'zoom-reflow-640', width: 640, height: 450 },
  { name: 'no-javascript', width: 393, height: 852, javaScriptEnabled: false },
]

try {
  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      javaScriptEnabled: profile.javaScriptEnabled ?? true,
      reducedMotion: 'reduce',
      ...(profile.phone
        ? {
            isMobile: true,
            hasTouch: true,
            userAgent:
              'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36',
          }
        : {}),
    })
    const page = await context.newPage()
    const errors = []
    const externalRequests = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.protocol.startsWith('http') && url.origin !== base.origin)
        externalRequests.push(url.origin)
    })
    try {
      const response = await page.goto(base.href, { waitUntil: 'networkidle' })
      assert.equal(response.status(), 200)
      assert.match(
        response.headers()['content-security-policy'] ?? '',
        /script-src[^;]*'nonce-/,
      )
      await expect(page).toHaveTitle('Kleym — Send prizes with a link')
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(
        page.getByText('Testnet preview', { exact: true }),
      ).toHaveCount(0)
      await expect(page.getByRole('contentinfo')).toContainText(
        'Stellar Testnet',
      )
      assert.equal(await page.locator('a button, button a').count(), 0)
      const layout = await page.evaluate(() => ({
        viewport: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        heroHeight: document
          .querySelector('h1')
          .closest('section')
          .getBoundingClientRect().height,
        pageHeight: document.documentElement.scrollHeight,
        headlineGap:
          document.querySelector('h1').getBoundingClientRect().top -
          document.querySelector('header').getBoundingClientRect().bottom,
        primaryActionBottom: document
          .querySelector('main a[href="/login"]')
          .getBoundingClientRect().bottom,
        brokenAnchors: [...document.querySelectorAll('a[href^="#"]')]
          .map((a) => a.getAttribute('href').slice(1))
          .filter((id) => !document.getElementById(id)),
        smallTargets: [...document.querySelectorAll('a, summary')]
          .filter(
            (el) =>
              getComputedStyle(el).position !== 'absolute' &&
              el.getBoundingClientRect().height < 44,
          )
          .map((el) => el.textContent.trim()),
      }))
      assert(layout.scrollWidth <= layout.viewport + 1, 'Horizontal overflow')
      assert(
        layout.headlineGap <= 48,
        'Headline must start close to the header',
      )
      if (profile.width >= 1024)
        assert(
          layout.primaryActionBottom < profile.height,
          'Primary action should be above the fold',
        )
      assert.deepEqual(layout.brokenAnchors, [])
      assert.deepEqual(layout.smallTargets, [])
      await page.screenshot({
        path: resolve(out, `${profile.name}.png`),
        fullPage: true,
      })
      if ([1280, 1440, 393].includes(profile.width)) {
        await page.screenshot({
          path: resolve(out, `${profile.name}-hero.png`),
        })
      }
      for (const [label, anchor] of [
        ['How it works', '#how-it-works'],
        ['Campaigns', '#campaigns'],
        ['Questions', '#questions'],
      ]) {
        await page
          .getByRole('navigation', { name: 'Homepage', exact: true })
          .getByRole('link', { name: label, exact: true })
          .click()
        assert.equal(new URL(page.url()).hash, anchor)
        await expect(page.locator(anchor)).toBeInViewport()
      }
      const summaries = page.locator('summary')
      assert.equal(await summaries.count(), 5)
      for (let i = 0; i < 5; i++) {
        await summaries.nth(i).click()
        await expect(page.locator('details').nth(i)).toHaveAttribute('open', '')
        await expect(page.locator('details').nth(i).locator('p')).toBeVisible()
        await summaries.nth(i).click()
        await expect(page.locator('details').nth(i)).not.toHaveAttribute(
          'open',
          '',
        )
      }
      // Keyboard focus and native details behavior under the production CSP.
      await summaries.nth(3).focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('details').nth(3)).toHaveAttribute('open', '')
      await expect(page.locator('details').nth(3).locator('p')).toContainText(
        'does not automatically send them back',
      )
      if (profile.javaScriptEnabled !== false) {
        assert.equal(
          await summaries
            .nth(3)
            .evaluate((el) => getComputedStyle(el).outlineStyle),
          'solid',
        )
      }
      await page.goto(base.href, { waitUntil: 'networkidle' })
      await page.keyboard.press('Tab')
      await expect(
        page.getByRole('link', { name: 'Skip to content' }),
      ).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('main')).toBeFocused()
      await page
        .getByRole('link', { name: 'Create a campaign', exact: true })
        .click()
      await expect(page).toHaveURL(new URL('/login', base).href)
      await expect(
        page.getByRole('heading', { name: /Sign in/i }),
      ).toBeVisible()
      assert.deepEqual(errors, [], 'Browser/CSP errors')
      assert.deepEqual(
        externalRequests,
        [],
        'Homepage must not need third-party resources',
      )
      results.push({
        profile: profile.name,
        passed: true,
        layout,
        browserErrors: 0,
        externalRequests: 0,
      })
    } catch (error) {
      failures.push({ profile: profile.name, error: error.message })
      await page
        .screenshot({
          path: resolve(out, `${profile.name}-failure.png`),
          fullPage: true,
        })
        .catch(() => {})
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
  writeFileSync(
    resolve(out, 'results.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        url: base.href,
        results,
        failures,
        scope:
          'Public homepage production browser checks; simulated viewports, not native phone-wallet approvals',
      },
      null,
      2,
    ),
  )
}
console.log(
  JSON.stringify({ passed: results.length, failed: failures.length, failures }),
)
assert.equal(failures.length, 0)
