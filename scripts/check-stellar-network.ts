/** Read-only network proof; no configuration secrets, signing or submission. */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { stellarMetadata, stellarConfigurationProblem, type StellarNetwork } from '../src/lib/stellar/network'

const args = process.argv.slice(2)
const option = (name: string) => args[args.indexOf(name) + 1]
const network = option('--network') as StellarNetwork
assert(['testnet', 'public'].includes(network), 'Specify --network testnet or --network public')
const identity = stellarMetadata(network)
const provider = network === 'public' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org'
assert.equal(stellarConfigurationProblem({ STELLAR_NETWORK: network, NETWORK_PASSPHRASE: identity.networkPassphrase, HORIZON_URL: provider, NODE_ENV: 'production' }), null)
async function read(path: string) {
  const response = await fetch(`${provider}${path}`, { signal: AbortSignal.timeout(15000) })
  assert(response.ok, `Public network read failed (${response.status})`)
  return response.json()
}
const [root, ledgers, issuer] = await Promise.all([
  read('/'), read('/ledgers?order=desc&limit=1'), read(`/accounts/${identity.defaultAsset.assetIssuer}`),
])
assert.equal(root.network_passphrase, identity.networkPassphrase, 'Provider identity mismatch')
assert.equal(issuer.account_id, identity.defaultAsset.assetIssuer, 'Issuer identity mismatch')
const ledger = ledgers._embedded.records[0]
const result = { checkedAt: new Date().toISOString(), network, asset: identity.defaultAsset, provider,
  providerPassphraseVerified: true, issuerAccountExists: true, ledger: ledger.sequence,
  closedAt: ledger.closed_at, protocolVersion: ledger.protocol_version,
  baseFeeStroops: String(ledger.base_fee_in_stroops), baseReserveStroops: String(ledger.base_reserve_in_stroops),
  writes: 0, qualification: 'Identity and public ledger read only. No wallet, funding, claim, reclaim or release qualification.' }
if (args.includes('--output')) writeFileSync(option('--output'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
