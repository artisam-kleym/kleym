// Read-only prerequisites. Private configuration is never included in output.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import dotenv from 'dotenv'
import Decimal from 'decimal.js'
import { Keypair, Networks } from '@stellar/stellar-sdk'
const config = dotenv.parse(fs.readFileSync('.env'))
assert.equal(config.STELLAR_NETWORK, 'testnet')
assert.equal(config.NETWORK_PASSPHRASE, Networks.TESTNET)
const root = await fetch(config.HORIZON_URL).then((response) => response.json())
assert.equal(root.network_passphrase, Networks.TESTNET)
const sponsor = Keypair.fromSecret(config.SPONSOR_SECRET_KEY).publicKey()
assert.equal(sponsor, config.SPONSOR_PUBLIC_KEY)
const keys = {
  sender: 'GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A',
  recipient: 'GCUFES42LLEWVEAI6TZDQUO63ROTR2ILUMNP4K7XCTHFT5F6NKSXGH3I',
  sponsor,
}
const latest = await fetch(`${config.HORIZON_URL.replace(/\/$/, '')}/ledgers?order=desc&limit=1`).then((response) => response.json())
const baseReserve = new Decimal(latest._embedded.records[0].base_reserve_in_stroops).div('10000000')
const accounts = {}
for (const [role, publicKey] of Object.entries(keys)) {
  const response = await fetch(`${config.HORIZON_URL.replace(/\/$/, '')}/accounts/${publicKey}`)
  assert(response.ok, `${role} account must exist`)
  const account = await response.json()
  const native = account.balances.find((balance) => balance.asset_type === 'native')
  const usdc = account.balances.find((balance) => balance.asset_code === 'USDC' && balance.asset_issuer === 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5')
  const reserve = new Decimal(2).plus(account.subentry_count).plus(account.num_sponsoring).minus(account.num_sponsored).times(baseReserve)
  accounts[role] = { publicKey, native: native.balance, usdc: usdc?.balance ?? '0',
    hasOfficialUsdcTrustline: !!usdc, minimumReserve: reserve.toFixed(7),
    spendableNative: new Decimal(native.balance).minus(native.selling_liabilities ?? 0).minus(reserve).toFixed(7) }
}
assert(new Decimal(accounts.sender.usdc).gte(2), 'sender needs at least 2 test USDC')
assert(new Decimal(accounts.sender.native).isZero(), 'sender zero-XLM test condition')
assert(new Decimal(accounts.recipient.native).isZero(), 'recipient zero-XLM test condition')
assert(accounts.recipient.hasOfficialUsdcTrustline, 'known recipient should retain its tested USDC trustline')
assert(new Decimal(accounts.sponsor.spendableNative).gte(10), 'sponsor headroom for the small test')
const proof = { checkedAt: new Date().toISOString(), network: 'testnet', readOnly: true, noChainWrites: true,
  officialUsdcIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', accounts, passed: true }
fs.writeFileSync('docs/reviews/2026-10-01/app-claim-reclaim/testnet-readiness.json', JSON.stringify(proof, null, 2) + '\n')
console.log(JSON.stringify(proof))
