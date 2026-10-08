/** Public, read-only transport probe. No tenant credentials, wallet or chain submission. */
import { writeFileSync } from 'node:fs'
import { outboundFetch } from '../src/lib/validation/outbound-fetch'

const output = process.argv[2]
if (!output) throw new Error('Provide a local JSON evidence output path')
const result: Record<string, unknown> = { checkedAt: new Date().toISOString(),
  provider: 'https://horizon-testnet.stellar.org/', method: 'GET', chainWrites: 0 }
try {
  const response = await outboundFetch('https://horizon-testnet.stellar.org/', { signal: AbortSignal.timeout(10_000) }, undefined, 'production')
  const root = await response.json() as { network_passphrase?: string }
  if (!response.ok || root.network_passphrase !== 'Test SDF Network ; September 2015') throw new Error('Provider response was not qualified')
  Object.assign(result, { status: 'PASS', httpStatus: response.status, network: 'testnet', networkPassphrase: root.network_passphrase })
} catch {
  Object.assign(result, { status: 'NOT_RUN', reason: 'Public HTTPS/DNS/TLS provider read unavailable; no readiness inferred' })
  process.exitCode = 2
}
writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
console.log(result.status)
