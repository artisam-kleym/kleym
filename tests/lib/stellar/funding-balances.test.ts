import { expect, it } from 'vitest'
import Decimal from 'decimal.js'
import type { Horizon } from '@stellar/stellar-sdk'
import { fundingBalances } from '@/lib/stellar/funding-balances'

it('keeps gross balances while deducting offer liabilities and native reserve exactly', () => {
  const account = { subentry_count: 1, num_sponsoring: 2, num_sponsored: 0, balances: [
    { asset_type: 'native', balance: '10.0000000', selling_liabilities: '2.0000000' },
    { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'public-fixture', balance: '20.0000000', selling_liabilities: '5.0000001' },
    { asset_type: 'liquidity_pool_shares', balance: '100', liquidity_pool_id: 'pool-fixture' },
  ] } as unknown as Horizon.AccountResponse
  expect(fundingBalances(account, new Decimal('0.5'))).toMatchObject([
    { assetCode: 'XLM', balance: '10.0000000', availableBalance: '5.5000000' },
    { assetCode: 'USDC', balance: '20.0000000', availableBalance: '14.9999999' },
  ])
  expect(fundingBalances(account, new Decimal('0.5'))).toHaveLength(2)
})

it('does not offer deauthorised credit balances as spendable principal', () => {
  const account = { subentry_count: 1, num_sponsoring: 0, num_sponsored: 3, balances: [
    { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'public-fixture', balance: '20', selling_liabilities: '0', is_authorized: false },
  ] } as unknown as Horizon.AccountResponse
  expect(fundingBalances(account, new Decimal('0.5'))[0]).toMatchObject({ balance: '20', availableBalance: '0.0000000' })
})

it('shows zero-XLM sponsored accounts correctly and never offers negative available principal', () => {
  const account = { subentry_count: 1, num_sponsoring: 0, num_sponsored: 3, balances: [
    { asset_type: 'native', balance: '0.0000000', selling_liabilities: '0.0000000' },
    { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'public-fixture', balance: '2', selling_liabilities: '3' },
  ] } as unknown as Horizon.AccountResponse
  expect(fundingBalances(account, new Decimal('0.5')).map((balance) => balance.availableBalance)).toEqual(['0.0000000', '0.0000000'])
})
