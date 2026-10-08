/**
 * Issue #97, interactive first step. Reuses Kleym's wallet signing helper.
 * Loopback-only, fixed Testnet/official USDC, sponsor key held in memory.
 * No application API, database, sender key, recovery phrase or link seed.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Horizon, Keypair, Networks, StrKey, type Transaction } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { bootstrapFeePerOperation, buildSponsoredBootstrap, verifyBootstrapSignature, BOOTSTRAP_ASSET, type BootstrapMode } from './lib/freighter-bootstrap'

const sender = process.argv[2]
const recipient = process.argv[3]
const evidenceDirectory = process.argv[4]
const mode = process.argv[5] ?? 'sender-usdc'
if (mode !== 'sender-usdc' && mode !== 'recipient-account-only') throw new Error('Choose sender-usdc or recipient-account-only bootstrap mode.')
if (!sender || !recipient || !evidenceDirectory || sender === recipient ||
    ![sender, recipient].every((address) => StrKey.isValidEd25519PublicKey(address))) {
  throw new Error('Usage: tsx scripts/spike-freighter-bootstrap.ts SENDER_G_ADDRESS RECIPIENT_G_ADDRESS EXISTING_EVIDENCE_DIRECTORY [sender-usdc|recipient-account-only]')
}
const target = mode === 'sender-usdc' ? sender : recipient
const reference = mode === 'sender-usdc' ? recipient : sender
const targetLabel = mode === 'sender-usdc' ? 'sender' : 'recipient'
const reserveUnits = mode === 'sender-usdc' ? 3 : 2
const host = '127.0.0.1:3217'
const origin = `http://${host}`
const horizon = new Horizon.Server('https://horizon-testnet.stellar.org')
const sponsor = Keypair.random()
let sponsorFunded = false
let busy = false
let pending: Transaction | undefined
let attempted = false
let receipt: Record<string, unknown> | undefined
let before: Record<string, unknown> | undefined
let referenceBefore: Awaited<ReturnType<typeof snapshot>> | undefined
const buildDirectory = await mkdtemp(join(tmpdir(), 'kleym-freighter-bootstrap-'))
const require = createRequire(import.meta.url)
const build = createRequire(require.resolve('tsx'))('esbuild').build as (options: object) => Promise<unknown>
await build({
  entryPoints: [fileURLToPath(new URL('./freighter-bootstrap-browser.ts', import.meta.url))],
  outdir: buildDirectory, bundle: true, format: 'esm', splitting: true, platform: 'browser',
  target: 'es2022', minify: true, logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"production"' },
})

async function assertTestnet() {
  const root = await horizon.root()
  if (root.network_passphrase !== Networks.TESTNET) throw new Error('Horizon Testnet identity mismatch.')
}
async function exists(address: string) {
  try { await horizon.loadAccount(address); return true } catch (error: any) {
    if (error?.response?.status === 404) return false
    throw error
  }
}
async function snapshot(address: string) {
  const [account, ledgers] = await Promise.all([horizon.loadAccount(address), horizon.ledgers().order('desc').limit(1).call()])
  const reserve = new Decimal(ledgers.records[0].base_reserve_in_stroops).div(10_000_000)
  const native = account.balances.find((balance) => balance.asset_type === 'native')!
  const minimum = reserve.mul(2 + account.subentry_count + account.num_sponsoring - account.num_sponsored)
  return {
    address, sequence: account.sequence, nativeBalance: native.balance,
    baseReserve: reserve.toFixed(7), minimumReserve: minimum.toFixed(7),
    nativeSellingLiabilities: native.selling_liabilities,
    spendableNative: new Decimal(native.balance).minus(minimum).minus(native.selling_liabilities).toFixed(7),
    numSponsoring: account.num_sponsoring, numSponsored: account.num_sponsored,
    accountSponsor: account.sponsor ?? null,
    balances: account.balances.map((balance: any) => ({
      assetType: balance.asset_type, code: balance.asset_code ?? 'XLM', issuer: balance.asset_issuer ?? null,
      balance: balance.balance, sponsor: balance.sponsor ?? null, limit: balance.limit ?? null,
    })),
  }
}
async function save(name: string, value: unknown) {
  await writeFile(join(evidenceDirectory, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
}
const session = new Date().toISOString().replace(/[:.]/g, '-')
async function prepare() {
  if (receipt) throw new Error('Wallet setup already confirmed.')
  if (attempted) throw new Error('Resolve the existing submission before preparing another transaction.')
  await assertTestnet()
  if (await exists(target)) throw new Error(`The ${targetLabel} is already activated; stop and review its ledger state.`)
  if (mode === 'sender-usdc') {
    if (await exists(reference)) throw new Error('The recipient is no longer absent; stop and review the fixture.')
  } else {
    referenceBefore = await snapshot(reference)
  }
  const fees = await horizon.feeStats()
  const perOperation = bootstrapFeePerOperation(fees.last_ledger_base_fee)
  if (!sponsorFunded) {
    const response = await fetch(`https://friendbot.stellar.org/?addr=${sponsor.publicKey()}`, { signal: AbortSignal.timeout(45_000) })
    if (!response.ok) throw new Error(`Isolated sponsor faucet returned HTTP ${response.status}.`)
    sponsorFunded = true
    await save(`bootstrap-sponsor-${session}.json`, { network: 'testnet', sponsor: sponsor.publicKey(), fundedAt: new Date().toISOString(), keyStorage: 'process memory only' })
  }
  before = await snapshot(sponsor.publicKey())
  pending = buildSponsoredBootstrap(await horizon.loadAccount(sponsor.publicKey()), target, perOperation, mode as BootstrapMode)
  pending.sign(sponsor)
  return {
    xdr: pending.toXDR(),
    review: {
      network: 'Stellar Testnet (no monetary value)', hash: pending.hash().toString('hex'),
      mode, target, targetLabel, sponsoredReserveUnits: reserveUnits,
      transactionSource: sponsor.publicKey(), requiredSigners: [sponsor.publicKey(), target], feeStroops: pending.fee,
      feeBasis: { lastLedgerBaseFeeStroops: fees.last_ledger_base_fee, perOperationBidStroops: perOperation, maximumPerOperationStroops: '10000' },
      sender, recipient, recipientRemainsAbsent: mode === 'sender-usdc', targetStartingXlm: '0.0000000',
      asset: mode === 'sender-usdc'
        ? { code: 'USDC', issuer: BOOTSTRAP_ASSET.getIssuer(), trustlineLimit: '100.0000000', principalTransferred: '0.0000000' }
        : { trustlineCreated: false, principalTransferred: '0.0000000' },
      operations: [
        { type: 'beginSponsoringFutureReserves', source: sponsor.publicKey(), sponsoredId: target },
        { type: 'createAccount', source: sponsor.publicKey(), destination: target, startingBalance: '0' },
        ...(mode === 'sender-usdc' ? [{ type: 'changeTrust', source: target, assetCode: 'USDC', issuer: BOOTSTRAP_ASSET.getIssuer(), limit: '100' }] : []),
        { type: 'endSponsoringFutureReserves', source: target },
      ],
    },
  }
}
async function submit(xdr: string) {
  if (receipt) {
    if (receipt.acceptancePassed !== true) throw new Error('The confirmed transaction failed setup assertions. Inspect the saved receipt before continuing.')
    return receipt
  }
  if (!pending || !before) throw new Error('Prepare a wallet setup first.')
  const signed = verifyBootstrapSignature(pending, xdr, target)
  const hash = pending.hash().toString('hex')
  await assertTestnet()
  let confirmed: any
  try { confirmed = await horizon.transactions().transaction(hash).call() } catch (error: any) {
    if (error?.response?.status !== 404) throw error
  }
  if (!confirmed) {
    if (mode === 'sender-usdc' && await exists(reference)) throw new Error('Recipient activation invalidated the absent-account fixture.')
    if (await exists(target)) throw new Error('Wallet activated outside this exact transaction; stop and review.')
    if (!attempted) {
      await save(`bootstrap-attempt-${session}.json`, { network: 'testnet', mode, target, hash, sender, recipient, sponsor: sponsor.publicKey(), before, referenceBefore, submittedAt: new Date().toISOString() })
      attempted = true
    }
    await horizon.submitTransaction(signed)
    confirmed = await horizon.transactions().transaction(hash).call()
  }
  if (!confirmed.successful) throw new Error('The wallet setup transaction failed on Testnet.')
  const [targetAfter, sponsorAfter, referenceExists] = await Promise.all([snapshot(target), snapshot(sponsor.publicKey()), exists(reference)])
  const referenceAfter = mode === 'recipient-account-only' ? await snapshot(reference) : undefined
  const trustline = targetAfter.balances.find((b) => b.code === 'USDC' && b.issuer === BOOTSTRAP_ASSET.getIssuer())
  const assertions = {
    targetHasLiteralZeroXlm: targetAfter.nativeBalance === '0.0000000',
    targetAccountSponsored: targetAfter.accountSponsor === sponsor.publicKey(),
    trustlineMatchesMode: mode === 'sender-usdc' ? trustline?.sponsor === sponsor.publicKey() : targetAfter.balances.length === 1 && !trustline,
    exactSponsoredReserveCount: targetAfter.numSponsored === reserveUnits,
    sponsorAddedExactReserves: sponsorAfter.numSponsoring === Number(before.numSponsoring) + reserveUnits,
    sponsorPaidExactFee: new Decimal(String(before.nativeBalance)).minus(sponsorAfter.nativeBalance).mul(10_000_000).equals(confirmed.fee_charged),
    referenceStatePreserved: mode === 'sender-usdc' ? !referenceExists : JSON.stringify(referenceBefore) === JSON.stringify(referenceAfter),
  }
  const ledger = typeof confirmed.ledger_attr === 'number' ? confirmed.ledger_attr : confirmed.ledger
  if (!Number.isInteger(ledger) || ledger <= 0) throw new Error('Confirmed transaction has no canonical ledger number; resolve the original hash before continuing.')
  receipt = {
    network: 'testnet', mode, target, hash, ledger, successful: confirmed.successful,
    feeChargedStroops: confirmed.fee_charged, confirmedAt: new Date().toISOString(),
    sender, recipient, sponsor: sponsor.publicKey(), requiredSignersVerified: [target, sponsor.publicKey()],
    sponsorBefore: before, targetAfter, senderAfter: mode === 'sender-usdc' ? targetAfter : referenceAfter,
    recipientAfter: mode === 'recipient-account-only' ? targetAfter : undefined, referenceBefore, referenceAfter, sponsorAfter, assertions,
    acceptancePassed: Object.values(assertions).every(Boolean),
    remaining: mode === 'sender-usdc' ? 'Acquire official test USDC, then prove sponsored funding, claim and expiry reclaim. This is setup only.'
      : 'Recipient account exists with zero XLM and no trustline. Return to Codex before sponsored funding/claim/reclaim. Its account reserves remain sponsored.',
  }
  await save(`bootstrap-receipt-${session}.json`, receipt)
  if (!Object.values(assertions).every(Boolean)) throw new Error('Transaction confirmed, but setup assertions failed. Stop and inspect the saved receipt.')
  return receipt
}
function respond(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  response.end(JSON.stringify(body))
}
async function readBody(request: IncomingMessage) {
  let text = ''
  for await (const chunk of request) {
    text += chunk.toString()
    if (text.length > 40_000) throw new Error('Request too large.')
  }
  return JSON.parse(text)
}
const walletLabel = mode === 'sender-usdc' ? 'Kleym Sender' : 'Kleym Recipient - No Trustline'
const setupDescription = mode === 'sender-usdc'
  ? 'Create your sender account and a test-USDC trustline with sponsored reserves. Your sender starts with <strong>zero XLM</strong>.'
  : 'Create only your sponsored recipient account, with <strong>zero XLM and no USDC trustline</strong>. The later claim will create the trustline with your wallet signature. Leave this wallet unfunded.'
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kleym - Testnet ${targetLabel} setup</title><link rel="stylesheet" href="/style.css"></head><body><main><p class="eyebrow">KLEYM - DEVELOPMENT PROOF</p><h1>Set up your Testnet ${targetLabel}</h1><p>${setupDescription} Test tokens have no monetary value.</p><p>Sender <code id="sender"></code></p><p>Recipient <code id="recipient"></code></p><p>${mode === 'sender-usdc' ? 'Keep the recipient unfunded. ' : ''}Select <strong>${walletLabel}</strong> and <strong>Testnet</strong> in Freighter.</p><div class="actions"><button id="connect">1. Connect Freighter</button><button id="prepare" disabled>2. Prepare ${targetLabel} setup</button><button id="sign" disabled>3. Sign in Freighter</button><button id="submit" disabled>4. Submit ${targetLabel} setup</button></div><p id="status" role="status" aria-live="polite">Connecting or opening this page submits no transaction. Preparation funds only an isolated sponsor via the Testnet faucet.</p><pre id="review" aria-label="Transaction review"></pre></main><script type="module" src="/assets/freighter-bootstrap-browser.js"></script></body></html>`
const css = `:root{font-family:system-ui,sans-serif;color:#17242a;background:#f3f6f4}body{margin:0}main{max-width:850px;margin:4rem auto;padding:2rem;background:white;border:1px solid #dce6df;border-radius:16px}h1{font-size:2rem;letter-spacing:-.04em}.eyebrow{font-size:.75rem;letter-spacing:.12em;color:#3b7357}p{line-height:1.6}code{display:block;overflow-wrap:anywhere;font-size:.85rem}.actions{display:flex;flex-wrap:wrap;gap:.6rem;margin:2rem 0}button{padding:.8rem 1rem;border:1px solid #1e6040;border-radius:8px;background:#1e6040;color:white;cursor:pointer;font:inherit}button:disabled{opacity:.45;cursor:default}button:focus-visible{outline:3px solid #de9d25;outline-offset:3px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8rem;line-height:1.5}@media(max-width:650px){main{margin:1rem;padding:1.2rem}.actions{flex-direction:column}}`
await assertTestnet()
const http = createServer(async (request, response) => {
  response.setHeader('referrer-policy', 'no-referrer')
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://stellar.creit.tech; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
  if (request.headers.host !== host) return respond(response, 403, { error: 'Invalid local host.' })
  const path = request.url ?? '/'
  try {
    if (request.method === 'GET' && path === '/') { response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); response.end(html); return }
    if (request.method === 'GET' && path === '/style.css') { response.writeHead(200, { 'content-type': 'text/css' }); response.end(css); return }
    if (request.method === 'GET' && /^\/assets\/[\w.-]+\.js$/.test(path)) {
      const content = await readFile(join(buildDirectory, path.slice('/assets/'.length)))
      response.writeHead(200, { 'content-type': 'application/javascript' }); response.end(content); return
    }
    if (request.method === 'GET' && path === '/status') return respond(response, 200, { network: 'testnet', sender, recipient, mode, target, targetLabel, walletLabel, receipt })
    if (request.method !== 'POST' || !['/prepare', '/submit'].includes(path)) return respond(response, 404, { error: 'Not found.' })
    if (request.headers.origin !== origin || request.headers['x-kleym-proof'] !== 'bootstrap' || request.headers['content-type'] !== 'application/json') {
      return respond(response, 403, { error: 'Only the local signing page can initiate this proof.' })
    }
    if (busy) return respond(response, 409, { error: 'Another proof action is still running.' })
    busy = true
    try {
      const body = await readBody(request)
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          (path === '/prepare' ? Object.keys(body).length !== 0 : Object.keys(body).length !== 1 || typeof body.xdr !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.xdr))) {
        throw new Error('Unexpected request shape.')
      }
      respond(response, 200, path === '/prepare' ? await prepare() : await submit(body.xdr))
    } finally { busy = false }
  } catch (error: any) {
    const codes = error?.response?.data?.extras?.result_codes
    const message = codes ? `Testnet rejected the transaction: ${JSON.stringify(codes)}.` :
      error?.response ? 'Testnet provider request failed. Retry the exact signed submission; do not prepare another.' :
      error instanceof SyntaxError ? 'The request could not be decoded.' :
      error instanceof Error ? error.message : 'The proof request failed.'
    respond(response, 400, { error: message })
  }
})
http.listen(3217, '127.0.0.1', () => console.log(`Freighter Testnet setup ready: ${origin}`))
console.log(`Temporary browser bundle: ${dirname(join(buildDirectory, 'freighter-bootstrap-browser.js'))}`)
