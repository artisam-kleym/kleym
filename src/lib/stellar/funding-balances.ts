import Decimal from 'decimal.js'
import type { Horizon } from '@stellar/stellar-sdk'
import { spendableNative } from './horizon'

/** Ledger balances stay visible; only spendable principal is offered for distribution. */
export function fundingBalances(account: Pick<Horizon.AccountResponse, 'balances' | 'subentry_count' | 'num_sponsoring' | 'num_sponsored'>, reserve: Decimal) {
  return account.balances.filter((balance) => balance.asset_type !== 'liquidity_pool_shares').map((balance) => ({
    assetType: balance.asset_type,
    assetCode: 'asset_code' in balance ? balance.asset_code : 'XLM',
    assetIssuer: 'asset_issuer' in balance ? balance.asset_issuer : null,
    balance: balance.balance,
    availableBalance: Decimal.max(0, balance.asset_type === 'native'
      ? spendableNative(account, reserve)
      : 'is_authorized' in balance && balance.is_authorized === false ? 0
      : new Decimal(balance.balance).minus('selling_liabilities' in balance ? balance.selling_liabilities : 0)).toFixed(7),
  }))
}
