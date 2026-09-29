/** Isolated network identity for DB harnesses whose ledger operations are injected.
 * Optional absent-account reads support materialisation checks. No signatures,
 * submissions or remote connections are allowed.
 */
import { createServer } from 'node:http'
import { Networks } from '@stellar/stellar-sdk'

export async function startTestnetNetworkFixture(options: { missingAccounts?: boolean } = {}): Promise<() => Promise<void>> {
  if (process.env.STELLAR_NETWORK !== 'testnet' || process.env.NETWORK_PASSPHRASE !== Networks.TESTNET || process.env.NODE_ENV !== 'test') {
    throw new Error('network fixtures require an explicit testnet test environment')
  }
  const server = createServer((request, response) => {
    const root = request.method === 'GET' && request.url === '/'
    const missingAccount = options.missingAccounts && request.method === 'GET' && /^\/accounts\/G[A-Z2-7]{55}$/.test(request.url ?? '')
    response.writeHead(root ? 200 : 404, { 'content-type': 'application/json' })
    response.end(JSON.stringify(root ? { network_passphrase: Networks.TESTNET } : missingAccount
      ? { status: 404, title: 'Resource Missing', detail: 'Account does not exist in this fixture' }
      : { error: 'network fixture permits identity reads only' }))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('network fixture did not bind')
  process.env.HORIZON_URL = `http://127.0.0.1:${address.port}/`
  return () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
