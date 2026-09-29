/** Interactive #97 continuation of the existing spike; Testnet only.
 * Keys for links are generated and signed in the browser, never this process.
 * Reuses existing claim builders, predicates, wallet and local CSV helpers.
 */
import { createServer, type IncomingMessage } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Account, Horizon, Keypair, Networks, StrKey, TransactionBuilder, type Transaction } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { buildMaterialise, buildClaim, type ClaimContext, type LedgerFacts } from '../src/lib/stellar/claim'
import { bootstrapFeePerOperation, BOOTSTRAP_ASSET } from './lib/freighter-bootstrap'
import { buildProofFunding, buildProofReclaim, verifyProofSignatures } from './lib/freighter-lifecycle'

const [sender, recipient, evidenceDirectory] = process.argv.slice(2)
if (!sender || !recipient || !evidenceDirectory || sender === recipient || ![sender, recipient].every(key => StrKey.isValidEd25519PublicKey(key))) {
  throw new Error('Provide distinct sender/recipient G-addresses and an existing evidence directory.')
}
const origin = 'http://127.0.0.1:3218'
const horizon = new Horizon.Server('https://horizon-testnet.stellar.org')
const sponsor = Keypair.random()
const session = new Date().toISOString().replace(/[:.]/g, '-')
const pending = new Map<string, {
  transaction: Transaction; required: string[]; before: any; review: any; attempted: boolean
}>()
const receipts: Record<string, any> = {}
let keys: string[] = []
let balanceIds: string[] = []
let expiries: Date[] = []
let funded = false
let busy = false
let fatal = false
let counter = 0
const buildDirectory = await mkdtemp(join(tmpdir(), 'kleym-freighter-lifecycle-'))
const require = createRequire(import.meta.url)
const build = createRequire(require.resolve('tsx'))('esbuild').build as (options: object) => Promise<unknown>
await build({ entryPoints: [fileURLToPath(new URL('./freighter-lifecycle-browser.ts', import.meta.url))], outdir: buildDirectory,
  bundle: true, format: 'esm', splitting: true, platform: 'browser', target: 'es2022', minify: true, logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"production"' } })

async function assertTestnet() {
  if ((await horizon.root()).network_passphrase !== Networks.TESTNET) throw new Error('Testnet provider identity mismatch.')
}
async function absent(address: string) {
  try { await horizon.loadAccount(address); return false } catch (error: any) {
    if (error?.response?.status === 404) return true
    throw error
  }
}
async function snapshot(address: string) {
  const account = await horizon.loadAccount(address)
  const ledgers = await horizon.ledgers().order('desc').limit(1).call()
  const baseReserve = new Decimal(ledgers.records[0].base_reserve_in_stroops).div(10_000_000)
  const native = account.balances.find(b => b.asset_type === 'native')!
  const token: any = account.balances.find((b: any) => b.asset_code === 'USDC' && b.asset_issuer === BOOTSTRAP_ASSET.getIssuer())
  const minimum = baseReserve.mul(2 + account.subentry_count + account.num_sponsoring - account.num_sponsored)
  return { address, native: native.balance, usdc: token?.balance ?? '0.0000000', baseReserve: baseReserve.toFixed(7),
    accountSponsor: account.sponsor ?? null, trustlineSponsor: token?.sponsor ?? null,
    numSponsoring: account.num_sponsoring, numSponsored: account.num_sponsored, minimumReserve: minimum.toFixed(7),
    spendableNative: new Decimal(native.balance).minus(minimum).minus(native.selling_liabilities).toFixed(7) }
}
async function save(kind: string, value: unknown) {
  await writeFile(join(evidenceDirectory, `lifecycle-${session}-${++counter}-${kind}.json`), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
}
async function fee() { return bootstrapFeePerOperation((await horizon.feeStats()).last_ledger_base_fee) }
async function sponsorAccount() {
  const account = await horizon.loadAccount(sponsor.publicKey())
  return new Account(account.accountId(), account.sequence)
}
async function context(): Promise<ClaimContext> {
  return { sponsorAccount: await sponsorAccount(), sponsorPublicKey: sponsor.publicKey(), ephemeralPublicKey: keys[0],
    recipientPublicKey: recipient, asset: BOOTSTRAP_ASSET, amount: '1.0000000', balanceId: balanceIds[0],
    networkPassphrase: Networks.TESTNET, baseFee: await fee() }
}
function requireReceipt(stage: string) {
  if (!receipts[stage]?.acceptancePassed) throw new Error(`Complete ${stage} before this proof step.`)
}
async function prepare(stage: string, publicKeys?: unknown) {
  if (fatal) throw new Error('A confirmed receipt failed assertions. Stop and inspect the saved evidence.')
  if (receipts[stage]) throw new Error('This proof step is already complete.')
  if (pending.get(stage)?.attempted) throw new Error('Resolve the exact submitted hash before preparing a replacement.')
  await assertTestnet()
  let transaction: Transaction
  let required: string[]
  let extra: any = {}
  if (stage === 'fund') {
    if (!Array.isArray(publicKeys) || publicKeys.length !== 2 || new Set(publicKeys).size !== 2 ||
        publicKeys.some(key => typeof key !== 'string' || !StrKey.isValidEd25519PublicKey(key) || [sender, recipient, sponsor.publicKey()].includes(key))) {
      throw new Error('Expected exactly two distinct public link addresses.')
    }
    if (keys.length && !keys.every((key, i) => key === publicKeys[i])) throw new Error('Keep the original locally saved test keys for this session.')
    const s = await snapshot(sender)
    if (s.native !== '0.0000000' || new Decimal(s.usdc).lt(2) || s.numSponsored !== 3) throw new Error('Sender must own at least 2 official USDC, hold zero XLM and have three sponsored reserves.')
    if (!(await absent(recipient))) throw new Error('Keep the recipient absent for this first claim proof.')
    for (const key of publicKeys) if (!(await absent(key))) throw new Error('Test link addresses must be unactivated.')
    const baseFee = await fee()
    if (!funded) {
      const response = await fetch(`https://friendbot.stellar.org/?addr=${sponsor.publicKey()}`, { signal: AbortSignal.timeout(45_000) })
      if (!response.ok) throw new Error(`Test sponsor faucet returned HTTP ${response.status}.`)
      funded = true
      await save('sponsor', { network: 'testnet', sponsor: sponsor.publicKey(), keyStorage: 'process memory only' })
    }
    keys = publicKeys as string[]
    expiries = [new Date(Date.now() + 3_600_000), new Date(Date.now() + 300_000)]
    const plan = buildProofFunding({ sponsorAccount: await sponsorAccount(), sender, publicKeys: keys, expiries, baseFee })
    transaction = plan.transaction
    balanceIds = plan.balanceIds
    required = [sponsor.publicKey(), sender]
    extra = { publicKeys: keys, balanceIds, amounts: ['1.0000000', '1.0000000'], expiries: expiries.map(d => d.toISOString()),
      principalOwner: sender, totalSenderUsdcDebit: '2.0000000', balanceReserveSponsor: sponsor.publicKey() }
  } else if (stage === 'materialise') {
    requireReceipt('fund')
    if (Date.now() >= expiries[0].getTime()) throw new Error('The claim test link expired; reclaim is required instead.')
    if (!(await absent(keys[0])) || !(await absent(recipient))) throw new Error('Expected absent ephemeral and recipient accounts.')
    const plan = buildMaterialise(await context(), { ephemeralTrusts: false })
    transaction = TransactionBuilder.fromXDR(plan.xdr, Networks.TESTNET) as Transaction
    required = [sponsor.publicKey(), keys[0]]
    extra = { ephemeralPublicKey: keys[0], recipientStillAbsent: true }
  } else if (stage === 'claim') {
    requireReceipt('materialise')
    const ledger = (await horizon.ledgers().order('desc').limit(1).call()).records[0].sequence
    if (ledger <= receipts.materialise.ledger) throw new Error('Wait for the next ledger before preparing claim TX2.')
    if (Date.now() >= expiries[0].getTime()) throw new Error('Claim expiry reached; stop and recover via sender reclaim.')
    if (!(await absent(recipient))) throw new Error('Recipient activated outside this proof; inspect its state.')
    const facts: LedgerFacts = { ephemeralExists: true, ephemeralTrusts: true, recipientExists: false, recipientTrusts: false }
    const plan = buildClaim(await context(), facts)
    transaction = TransactionBuilder.fromXDR(plan.xdr, Networks.TESTNET) as Transaction
    required = [sponsor.publicKey(), keys[0], recipient]
    extra = { recipient, amount: '1.0000000', needsRecipientSignature: plan.needsRecipientSignature,
      materialiseLedger: receipts.materialise.ledger }
  } else if (stage === 'reclaim') {
    requireReceipt('claim')
    if (Date.now() < expiries[1].getTime()) throw new Error(`Reclaim is available after ${expiries[1].toISOString()}.`)
    const balance = await horizon.claimableBalances().claimableBalance(balanceIds[1]).call()
    if (balance.asset !== BOOTSTRAP_ASSET.toString() || balance.amount !== '1.0000000') throw new Error('Unexpected reclaim asset or amount.')
    transaction = buildProofReclaim(await sponsorAccount(), sender, balanceIds[1], await fee())
    required = [sponsor.publicKey(), sender]
    extra = { balanceId: balanceIds[1], amount: '1.0000000', expiresAt: expiries[1].toISOString() }
  } else throw new Error('Unknown proof step.')
  transaction.sign(sponsor)
  const before = { sender: await snapshot(sender), sponsor: await snapshot(sponsor.publicKey()) }
  const review = { stage, network: 'testnet', hash: transaction.hash().toString('hex'), source: transaction.source,
    asset: BOOTSTRAP_ASSET.toString(), feeBidStroops: transaction.fee, requiredSigners: required,
    operationTypes: transaction.operations.map(op => op.type), ...extra }
  pending.set(stage, { transaction, required, before, review, attempted: false })
  return { xdr: transaction.toXDR(), review }
}
async function transactionByHash(hash: string) {
  try { return await horizon.transactions().transaction(hash).call() } catch (error: any) {
    if (error?.response?.status === 404) return undefined
    throw error
  }
}
async function missingBalance(id: string) {
  try { await horizon.claimableBalances().claimableBalance(id).call(); return false } catch (error: any) {
    if (error?.response?.status === 404) return true
    throw error
  }
}
async function submit(stage: string, signedXdr: string) {
  if (fatal) throw new Error('A confirmed receipt failed assertions; stop and inspect evidence.')
  if (receipts[stage]) return receipts[stage]
  const plan = pending.get(stage)
  if (!plan) throw new Error('Prepare and review this proof step first.')
  const signed = verifyProofSignatures(plan.transaction, signedXdr, plan.required)
  const hash = signed.hash().toString('hex')
  await assertTestnet()
  let confirmed = await transactionByHash(hash)
  if (!confirmed) {
    if (!plan.attempted) {
      await save(`${stage}-attempt`, { hash, review: plan.review, before: plan.before })
      plan.attempted = true
    }
    await horizon.submitTransaction(signed)
    confirmed = await transactionByHash(hash)
  }
  if (!confirmed?.successful) throw new Error('No successful ledger confirmation yet; resolve this exact transaction hash.')
  const after = { sender: await snapshot(sender), sponsor: await snapshot(sponsor.publicKey()) }
  const assertions: Record<string, boolean> = {
    senderStillHasZeroXlm: after.sender.native === '0.0000000',
    sponsorPaidExactFee: new Decimal(plan.before.sponsor.native).minus(after.sponsor.native).mul(10_000_000).equals(confirmed.fee_charged),
  }
  let detail: any = {}
  if (stage === 'fund') {
    const balances = await Promise.all(balanceIds.map(id => horizon.claimableBalances().claimableBalance(id).call()))
    assertions.senderSuppliedExactlyTwoUsdc = new Decimal(plan.before.sender.usdc).minus(after.sender.usdc).equals(2)
    assertions.balancesHaveExactAssetAmountAndSponsor = balances.every((b, i) => b.id === balanceIds[i] && b.asset === BOOTSTRAP_ASSET.toString() && b.amount === '1.0000000' && b.sponsor === sponsor.publicKey())
    assertions.sponsorAddedFourClaimantReserves = after.sponsor.numSponsoring === plan.before.sponsor.numSponsoring + 4
    assertions.recipientStillAbsent = await absent(recipient)
    detail = { balances }
  } else if (stage === 'materialise') {
    const ephemeral = await snapshot(keys[0])
    assertions.ephemeralIsZeroXlmAndSponsored = ephemeral.native === '0.0000000' && ephemeral.numSponsored === 3 && ephemeral.accountSponsor === sponsor.publicKey() && ephemeral.trustlineSponsor === sponsor.publicKey()
    assertions.sponsorAddedThreeTemporaryReserves = after.sponsor.numSponsoring === plan.before.sponsor.numSponsoring + 3
    assertions.recipientStillAbsent = await absent(recipient)
    detail = { ephemeral }
  } else if (stage === 'claim') {
    const destination = await snapshot(recipient)
    assertions.recipientReceivedExactlyOneUsdc = destination.usdc === '1.0000000'
    assertions.recipientRemainsZeroXlmAndSponsored = destination.native === '0.0000000' && destination.numSponsored === 3 && destination.accountSponsor === sponsor.publicKey() && destination.trustlineSponsor === sponsor.publicKey()
    assertions.tx2InStrictlyLaterLedger = confirmed.ledger_attr > receipts.materialise.ledger
    assertions.ephemeralAccountRemoved = await absent(keys[0])
    assertions.claimedBalanceRemoved = await missingBalance(balanceIds[0])
    assertions.temporaryReservesReleased = after.sponsor.numSponsoring === plan.before.sponsor.numSponsoring - 2 // -3 temporary, -2 claimants, +3 recipient
    detail = { recipient: destination }
  } else if (stage === 'reclaim') {
    assertions.senderReceivedExactlyOneUsdc = new Decimal(after.sender.usdc).minus(plan.before.sender.usdc).equals(1)
    assertions.balanceRemoved = await missingBalance(balanceIds[1])
    assertions.twoClaimantReservesReleased = after.sponsor.numSponsoring === plan.before.sponsor.numSponsoring - 2
    detail = { recipient: await snapshot(recipient) }
  }
  const result = { stage, network: 'testnet', hash, ledger: confirmed.ledger_attr, successful: true,
    feeChargedStroops: confirmed.fee_charged, reviewed: plan.review, requiredSignersVerified: plan.required,
    before: plan.before, after, ...detail, assertions, acceptancePassed: Object.values(assertions).every(Boolean) }
  await save(`${stage}-receipt`, result)
  if (!result.acceptancePassed) { fatal = true; throw new Error('Transaction confirmed but a proof assertion failed. Stop and inspect the saved receipt.') }
  receipts[stage] = result
  return result
}
async function body(request: IncomingMessage) {
  let text = ''
  for await (const chunk of request) { text += chunk.toString(); if (text.length > 40_000) throw new Error('Request too large.') }
  return JSON.parse(text)
}
const css = `:root{font-family:system-ui,sans-serif;background:#f3f6f4;color:#17242a}body{margin:0}main{max-width:900px;margin:2rem auto;background:white;padding:2rem;border-radius:16px}p{line-height:1.6}h1{letter-spacing:-.03em}.actions{display:flex;gap:.6rem;flex-wrap:wrap;margin:1rem 0}button{font:inherit;padding:.8rem;border-radius:8px;background:#1e6040;color:white;border:0;cursor:pointer}button:disabled{opacity:.4;cursor:default}button:focus-visible{outline:3px solid #de9d25;outline-offset:3px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8rem;line-height:1.5}label{display:block;margin:1rem 0}code{overflow-wrap:anywhere}section{border-top:1px solid #dce6df;padding-top:1rem;margin-top:1rem}@media(max-width:600px){main{margin:1rem;padding:1rem}.actions{flex-direction:column}}`
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kleym · Testnet lifecycle proof</title><link rel="stylesheet" href="/style.css"></head><body><main><p>KLEYM · TESTNET PROOF</p><h1>Fund, claim and reclaim</h1><p>Use 2 of your 20 test USDC to create two 1-USDC test links. Claim one into the empty recipient wallet and reclaim the other after expiry. Test tokens have no monetary value.</p><p>Sender: <code id="sender"></code><br>Recipient: <code id="recipient"></code></p><p>Keep this tab open. Save the test-key CSV before funding; it stays on your computer. Use the same tab for the recipient claim.</p><div class="actions"><button id="connect">Connect Freighter</button><button id="keys">Generate test keys</button><button id="download" disabled>Download test-key CSV</button></div><label><input id="saved" type="checkbox" disabled> I saved the test-key CSV privately</label><label>Restore saved test keys locally: <input id="restore" type="file" accept=".csv"></label><section><h2>1. Fund two test links</h2><p>Select Kleym Sender and Testnet in Freighter. The separate sponsor pays fees and reserves.</p><div class="actions"><button id="fund-prepare" disabled>Prepare 2-USDC funding</button><button id="fund-sign" disabled>Sign funding in Freighter</button><button id="fund-submit" disabled>Submit funding</button></div></section><section><h2>2. Claim one USDC</h2><p>After funding, select Kleym Recipient in Freighter and connect again. Begin claim creates the temporary account; the next transaction delivers 1 USDC and cleans it up in a later ledger.</p><div class="actions"><button id="materialise" disabled>Begin recipient claim (TX1)</button><button id="claim-prepare" disabled>Prepare claim (TX2)</button><button id="claim-sign" disabled>Sign claim in Freighter</button><button id="claim-submit" disabled>Submit claim</button></div></section><section><h2>3. Reclaim the expired link</h2><p>Select Kleym Sender again. The second link expires five minutes after preparation. Reclaim is available after expiry.</p><div class="actions"><button id="reclaim-prepare" disabled>Prepare expiry reclaim</button><button id="reclaim-sign" disabled>Sign reclaim in Freighter</button><button id="reclaim-submit" disabled>Submit reclaim</button></div></section><p id="status" role="status" aria-live="polite">Opening or connecting submits nothing. Generate and save test keys to begin.</p><pre id="review" aria-label="Transaction review"></pre></main><script type="module" src="/assets/freighter-lifecycle-browser.js"></script></body></html>`
await assertTestnet()
const http = createServer(async (request, response) => {
  response.setHeader('cache-control', 'no-store')
  response.setHeader('referrer-policy', 'no-referrer')
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://stellar.creit.tech; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
  const send = (status: number, value: unknown) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)) }
  if (request.headers.host !== '127.0.0.1:3218') return send(403, { error: 'Invalid local host.' })
  try {
    const path = request.url ?? '/'
    if (request.method === 'GET' && path === '/') { response.writeHead(200, { 'content-type': 'text/html' }); response.end(html); return }
    if (request.method === 'GET' && path === '/style.css') { response.writeHead(200, { 'content-type': 'text/css' }); response.end(css); return }
    if (request.method === 'GET' && /^\/assets\/[\w.-]+\.js$/.test(path)) {
      const content = await readFile(join(buildDirectory, path.slice('/assets/'.length)))
      response.writeHead(200, { 'content-type': 'application/javascript' }); response.end(content); return
    }
    if (request.method === 'GET' && path === '/state') return send(200, { sender, recipient, sponsor: sponsor.publicKey(), publicKeys: keys, balanceIds, expiries: expiries.map(d => d.toISOString()), receipts, fatal })
    const route = /^\/(fund|materialise|claim|reclaim)\/(prepare|submit)$/.exec(path)
    if (request.method !== 'POST' || !route) return send(404, { error: 'Not found.' })
    if (request.headers.origin !== origin || request.headers['x-kleym-proof'] !== 'lifecycle' || request.headers['content-type'] !== 'application/json') return send(403, { error: 'Use the local lifecycle page.' })
    if (busy) return send(409, { error: 'A proof action is already running.' })
    busy = true
    try {
      const input = await body(request)
      const fields = route[2] === 'submit' ? ['xdr'] : route[1] === 'fund' ? ['publicKeys'] : []
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== fields.length || Object.keys(input).some(k => !fields.includes(k))) throw new Error('Unexpected request shape.')
      if (route[2] === 'submit' && (typeof input.xdr !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.xdr))) throw new Error('Expected a signed XDR envelope.')
      send(200, route[2] === 'prepare' ? await prepare(route[1], input.publicKeys) : await submit(route[1], input.xdr))
    } finally { busy = false }
  } catch (error: any) {
    const codes = error?.response?.data?.extras?.result_codes
    send(400, { error: codes ? `Testnet rejected this exact transaction: ${JSON.stringify(codes)}. Keep this session open and return to Codex.` :
      error?.response ? 'Provider request failed. Resolve the original hash before replacing submitted work.' :
      error instanceof SyntaxError ? 'Invalid request encoding.' : error instanceof Error ? error.message : 'Proof action failed.' })
  }
})
http.listen(3218, '127.0.0.1', () => console.log(`Freighter lifecycle proof ready: ${origin}`))
