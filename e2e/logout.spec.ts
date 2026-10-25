import { test, expect } from '@playwright/test'

test('desktop and mobile logout revoke sessions and allow retry after failure', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(60_000)
  // Separate sessions: logging out must not invalidate the suite's shared login.
  for (const width of [1440, 393]) {
    const context = await browser.newContext({
      baseURL,
      viewport: { width, height: 852 },
      storageState: { cookies: [], origins: [] },
    })
    const revoked = await browser.newContext()
    try {
      const response = await context.request.post(`${baseURL}/api/auth/login`, {
        headers: { Origin: baseURL! },
        data: {
          username: process.env.E2E_USERNAME ?? 'e2e',
          password: process.env.E2E_PASSWORD ?? 'e2e-verification-password-1',
        },
      })
      expect(response.status()).toBe(200)
      const previous = await context.storageState()
      const page = await context.newPage()
      await page.goto('/dashboard')
      await expect(
        page.getByRole('heading', { name: 'Dashboard', exact: true }),
      ).toBeVisible()
      if (width < 1024)
        await page.getByRole('button', { name: 'Menu', exact: true }).click()
      await page.route('**/api/auth/logout', (route) =>
        route.fulfill({ status: 503, body: '{}' }),
      )
      await page.getByRole('button', { name: 'Log out', exact: true }).click()
      await expect(
        page.locator('.logout-control').getByRole('alert'),
      ).toContainText('Could not log out')
      await expect(
        page.getByRole('button', { name: 'Log out', exact: true }),
      ).toBeEnabled()
      await page.unroute('**/api/auth/logout')
      await page.getByRole('button', { name: 'Log out', exact: true }).click()
      await page.waitForURL('**/login')
      expect(
        (await context.cookies()).some(
          (cookie) => cookie.name === '__Host-kleym_session',
        ),
      ).toBe(false)
      await page.goto('/dashboard')
      await expect(page).toHaveURL(/\/login$/)
      // Replaying the old cookie is refused, proving the database session was revoked.
      await revoked.addCookies(previous.cookies)
      const replay = await revoked.newPage()
      await replay.goto(`${baseURL}/dashboard`)
      await expect(replay).toHaveURL(/\/login$/)
    } finally {
      await context.close()
      await revoked.close()
    }
  }
})
