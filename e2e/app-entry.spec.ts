import { test, expect } from '@playwright/test'
const website = process.env.MARKETING_SITE_URL
test.skip(
  !website,
  'Separate-site entry is qualified when MARKETING_SITE_URL is configured.',
)

test('separate app root opens the dashboard and home links use the website', async ({
  page,
}) => {
  // CI activates the split against a placeholder website; no third-party navigation.
  await page.goto('/')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(
    page.getByRole('heading', { name: 'Dashboard', exact: true }),
  ).toBeVisible()
  await page.goto('/settings/security')
  await expect(
    page.getByRole('link', { name: 'Kleym', exact: true }),
  ).toHaveAttribute('href', website!)
})

test('anonymous app root opens login with the separate home backlink', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  })
  try {
    const page = await context.newPage()
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await expect(
      page.getByRole('link', { name: 'Back to home', exact: true }),
    ).toHaveAttribute('href', website!)
  } finally {
    await context.close()
  }
})

test('unknown app paths keep the configured website home link', async ({
  page,
}) => {
  await page.goto('/website-split-missing-page')
  await expect(
    page.getByRole('heading', { name: 'Page not found', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Go to home', exact: true }),
  ).toHaveAttribute('href', website!)
})
