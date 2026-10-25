import { test, expect } from '@playwright/test'

test.describe('mobile settings', () => {
  for (const width of [320, 393]) {
    test(`keeps account controls readable within ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/settings')
      for (const name of ['Current password', 'New password']) {
        const input = page.getByLabel(name, { exact: true })
        await expect(input).toBeVisible()
        const box = (await input.boundingBox())!
        expect(box.width).toBeGreaterThanOrEqual(width - 64)
        expect(box.height).toBeGreaterThanOrEqual(44)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
        expect(await input.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16)
      }
      // Wide member/key tables scroll locally; they must not resize the page.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      const button = page.getByRole('button', { name: 'Change password', exact: true })
      await button.scrollIntoViewIfNeeded()
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    })
  }
  test('allows password retry after losing the network', async ({ page }) => {
    await page.goto('/settings')
    await page.route('**/api/auth/password', (route) => route.abort('failed'))
    await page.getByLabel('Current password', { exact: true }).fill('fixture-current-not-a-real-password')
    await page.getByLabel('New password', { exact: true }).fill('fixture-new-not-a-real-password')
    await page.getByRole('button', { name: 'Change password', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Connection lost' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeEnabled()
  })
})
