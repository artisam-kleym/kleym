import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:3226')
const staticSite = process.argv[4] === 'static'
const appBase = new URL(process.argv[5] ?? base)
const compatibility = process.argv[6] === 'compatibility'
assert(
  base.protocol === 'https:' ||
    ['127.0.0.1', 'localhost'].includes(base.hostname),
)
const out = resolve(process.argv[3] ?? '.runtime/homepage-motion-verification')
mkdirSync(out, { recursive: true })
const results = [],
  failures = []
const browser = await chromium.launch()
const profiles = [
  { name: 'desktop-motion', width: 1440, height: 900 },
  { name: 'android-motion', width: 393, height: 852, phone: true },
  { name: 'observer-unavailable', width: 393, height: 852, noObserver: true },
  { name: 'no-javascript-motion', width: 393, height: 852, noJS: true },
]

try {
  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      reducedMotion: 'no-preference',
      javaScriptEnabled: !profile.noJS,
      recordVideo: {
        dir: resolve(out, 'videos'),
        size: { width: profile.width, height: profile.height },
      },
      ...(profile.phone
        ? {
            isMobile: true,
            hasTouch: true,
            userAgent:
              'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36',
          }
        : {}),
    })
    if (profile.noObserver)
      await context.addInitScript(() => {
        delete window.IntersectionObserver
      })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text())
    })
    try {
      const response = await page.goto(base.href, { waitUntil: 'networkidle' })
      assert.equal(response.status(), 200)
      const start = await page.evaluate(() => {
        const root = document.querySelector('[data-home-motion-root]')
        const hero = getComputedStyle(root.querySelector('h1'))
        const picture = getComputedStyle(root.querySelector('svg'))
        return {
          heroAnimation: hero.animationName,
          pictureAnimation: picture.animationName,
          pictureIterations: picture.animationIterationCount,
          inlineStyles: root.querySelectorAll('[style]').length,
        }
      })
      assert.match(start.heroAnimation, /heroEnter/)
      assert.match(start.pictureAnimation, /prizeSettle/)
      assert.equal(start.pictureIterations, '1')
      assert.equal(start.inlineStyles, 0, 'No inline-style CSP relaxation')
      await page.screenshot({ path: resolve(out, `${profile.name}-hero.png`) })
      const campaign = page.locator('#campaigns')
      await campaign.scrollIntoViewIfNeeded()
      if (!profile.noObserver && !profile.noJS) {
        await expect
          .poll(() =>
            campaign.evaluate((el) => getComputedStyle(el).animationName),
          )
          .toMatch(/sectionEnter/)
        await page.waitForTimeout(700)
        // Re-entry keeps the same completed animation rather than starting a new one.
        const previous = await campaign.evaluate((el) =>
          el.getAnimations().map((a) => a.startTime),
        )
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
        await campaign.scrollIntoViewIfNeeded()
        const returned = await campaign.evaluate((el) =>
          el.getAnimations().map((a) => a.startTime),
        )
        assert.deepEqual(returned, previous)
      }
      await expect(campaign.getByRole('heading', { level: 2 })).toBeVisible()
      if (profile.noObserver || profile.noJS) {
        assert.equal(
          await campaign.evaluate((el) => getComputedStyle(el).opacity),
          '1',
        )
        assert.equal(
          await campaign.evaluate((el) => getComputedStyle(el).animationName),
          'none',
        )
      }
      // Poll from the test runner: page RAF polling cannot run with JS disabled.
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              document
                .querySelector('[data-home-motion-root]')
                .getAnimations({ subtree: true })
                .every((a) => a.playState !== 'running'),
            ),
          { timeout: 10000 },
        )
        .toBe(true)
      await page.screenshot({
        path: resolve(out, `${profile.name}-settled.png`),
        fullPage: true,
      })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document
                .querySelector('[data-home-motion-root]')
                .getAnimations({ subtree: true }).length,
          ),
        )
        .toBe(0)
      assert.equal(
        await page.evaluate(
          () => getComputedStyle(document.documentElement).scrollBehavior,
        ),
        'auto',
      )
      await page.screenshot({
        path: resolve(out, `${profile.name}-reduced.png`),
        fullPage: true,
      })
      if (staticSite) {
        const [app] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name: 'Create a campaign', exact: true }).click()])
        if (compatibility) await app.getByRole('link', { name: 'Create a campaign', exact: true }).click()
        await expect(app).toHaveURL(new URL('/login', appBase).href)
        await app.close()
        // Exercise document cleanup separately: Open App intentionally leaves the website open.
        await page.goto(new URL('/login', appBase).href)
      } else {
        await page.getByRole('link', { name: 'Create a campaign', exact: true }).click()
        await expect(page).toHaveURL(new URL('/login', base).href)
      }
      assert.equal(await page.locator('[data-home-motion-root]').count(), 0)
      assert.equal(
        await page.evaluate(
          () => getComputedStyle(document.documentElement).scrollBehavior,
        ),
        'auto',
      )
      assert.deepEqual(errors, [])
      results.push({
        profile: profile.name,
        video: `videos/${basename(await page.video().path())}`,
        passed: true,
        start,
        reducedMotionStopsAllEffects: true,
        homepageNavigationCleanup: true,
      })
    } catch (error) {
      failures.push({ profile: profile.name, error: error.message })
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
          'Public-page motion, fallback and accessibility checks; no login or wallet requests',
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
