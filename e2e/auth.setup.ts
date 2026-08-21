import { test as setup, expect } from '@playwright/test'

/**
 * Signs in ONCE and saves the session for every spec.
 *
 * Not just a speed-up. Login is rate limited to 5 attempts per 15 minutes per
 * IP (AGENT.md §5.6), so a suite that logs in per test locks itself out after
 * the fifth — and the failure looks like a broken page rather than the limiter
 * doing exactly its job. Reusing one session is also closer to how the wizard
 * is actually reached.
 */
const USERNAME = process.env.E2E_USERNAME ?? 'e2e'
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-verification-password-1'

export const STORAGE_STATE = 'e2e/.auth/session.json'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Username').fill(USERNAME)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()

  await page.waitForURL(/\/dashboard/)
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()

  await page.context().storageState({ path: STORAGE_STATE })
})
