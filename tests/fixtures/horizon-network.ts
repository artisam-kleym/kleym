/** Isolated network identity for DB harnesses whose ledger operations are injected.
 * Optional absent-account reads support materialisation checks. No signatures,
 * submissions or remote connections are allowed.
 */
import { createServer } from 'node:http'
import { Networks } from '@stellar/stellar-sdk'

export interface FixtureAccount { sequence: string; nativeBalance: string }
interface FixtureOptions {
  missingAccounts?: boolean
  /** Explicit accounts only; callers may advance sequence after injected settlement. */
  accounts?: Map<string, FixtureAccount>
  baseReserveStroops?: number
}

export async function startTestnetNetworkFixture(options: FixtureOptions = {}): Promise<() => Promise<void>> {
  if (process.env.STELLAR_NETWORK !== 'testnet' || process.env.NETWORK_PASSPHRASE !== Networks.TESTNET || process.env.NODE_ENV !== 'test') {
    throw new Error('network fixtures require an explicit testnet test environment')
  }
  const server = createServer((request, response) => {
    const root = request.method === 'GET' && request.url === '/'
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const publicKey = url.pathname.match(/^\/accounts\/(G[A-Z2-7]{55})$/)?.[1]
    const account = request.method === 'GET' && publicKey ? options.accounts?.get(publicKey) : undefined
    const ledger = request.method === 'GET' && url.pathname === '/ledgers' && options.baseReserveStroops !== undefined
    const missingAccount = options.missingAccounts && request.method === 'GET' && /^\/accounts\/G[A-Z2-7]{55}$/.test(request.url ?? '')
    response.writeHead(root || account || ledger ? 200 : 404, { 'content-type': 'application/json' })
    response.end(JSON.stringify(root ? { network_passphrase: Networks.TESTNET } : account ? {
      account_id: publicKey, sequence: account.sequence, subentry_count: 0, num_sponsoring: 0, num_sponsored: 0,
      balances: [{ asset_type: 'native', balance: account.nativeBalance, selling_liabilities: '0.0000000' }],
    } : ledger ? {
      _links: {}, _embedded: { records: [{ base_reserve_in_stroops: options.baseReserveStroops,
        sequence: 123, closed_at: new Date().toISOString() }] },
    } : missingAccount
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
