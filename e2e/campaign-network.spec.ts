import { expect, test } from '@playwright/test'

const sender = 'GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A'
const issuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'

test('shows unavailable Mainnet and retains manual spendable-balance prize entry', async ({ page }) => {
  await page.route('**/api/stellar/account?*', (route) => route.fulfill({ json: { network: 'testnet', exists: true, balances: [
    { assetCode: 'USDC', assetIssuer: issuer, balance: '100', availableBalance: '65' },
    { assetCode: 'XLM', assetIssuer: null, balance: '0', availableBalance: '0' },
  ] } }))
  await page.goto('/campaigns/new')
  await expect(page.getByRole('button', { name: 'Testnet · test funds', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Mainnet · unavailable', exact: true })).toBeDisabled()
  await page.getByLabel('Campaign name').fill('Wallet-sized prizes')
  await page.getByLabel('Funding account', { exact: true }).fill(sender)
  await expect(page.getByLabel('Asset', { exact: true }).locator('option', { hasText: 'USDC — 65 available' })).toHaveCount(1)
  await page.getByLabel('Amount per link', { exact: true }).fill('5')
  await expect(page.getByTestId('next-step')).toBeEnabled()
  await page.getByTestId('next-step').click()
  await page.getByLabel('Number of links', { exact: true }).fill('13')
  await expect(page.getByTestId('next-step')).toBeEnabled()
  await page.getByLabel('Number of links', { exact: true }).fill('14')
  await expect(page.getByText('This account does not hold enough of that asset.', { exact: true })).toBeVisible()
  await expect(page.getByTestId('next-step')).toBeDisabled()
})

test('does not query an invalid funding address, and retries a provider failure without calling it an absent account', async ({ page }) => {
  let reads = 0
  await page.route('**/api/stellar/account?*', (route) => {
    reads++
    return reads === 1 ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { network: 'testnet', exists: true, balances: [
      { assetCode: 'USDC', assetIssuer: issuer, balance: '20', availableBalance: '15' },
      { assetCode: 'XLM', assetIssuer: null, balance: '0', availableBalance: '0' },
    ] } })
  })
  await page.goto('/campaigns/new')
  await page.getByLabel('Funding account', { exact: true }).fill('G'.repeat(56))
  await page.waitForTimeout(150)
  expect(reads).toBe(0)
  await page.getByLabel('Funding account', { exact: true }).fill(sender)
  await expect(page.getByRole('button', { name: 'Retry balance check' })).toBeVisible()
  await expect(page.getByText('This account does not exist on the selected network yet.', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Retry balance check' }).click()
  await expect(page.getByLabel('Asset', { exact: true }).locator('option', { hasText: 'USDC — 15 available' })).toHaveCount(1)
  expect(reads).toBe(2)
})
