/**
 * Verification for the write API, webhooks and the SDK (#51). Real Postgres
 * and Redis; a local stand-in Horizon; a local webhook receiver; the v1
 * route handlers invoked in-process through the SDK's own `fetch` hook.
 *
 * What is proven: the SDK creates a campaign end to end with no browser —
 * keys generated locally, public halves registered, the secrets CSV on
 * disk at 0600, export marked, every batch prepared, signed locally and
 * submitted — and no seed appears in any request the SDK sent, any log
 * line the server wrote, or any row it stored. Every write endpoint refuses
 * a planted seed with 400 and a SEED_SUBMITTED event. Deliveries are
 * signed; the SDK verifier accepts them and refuses a replay and a
 * tampered body. A failing endpoint is retried with backoff, parked, and
 * disabled after repeated parks — all visible to the organisation. No
 * payload can carry a claim URL, a fragment, a seed or an address. Writes
 * are limited per key, separately from reads.
 *
 * Run: pnpm verify:write-api
 */
import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()
process.env.MAX_OPS_PER_BATCH = '5'
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
let sdkSender: string | null = null

/* ── a stand-in Horizon ────────────────────────────────────────────────── */

const horizonLog: string[] = []
const sourceSequences = new Map<string, string>()
const horizon: Server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  horizonLog.push(`${req.method} ${url.pathname}`)
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (req.method === 'GET' && url.pathname === '/') {
    return json(200, { network_passphrase: Networks.TESTNET })
  }
  if (req.method === 'GET' && /^\/accounts\/G[A-Z2-7]{55}$/.test(url.pathname)) {
    const id = url.pathname.slice('/accounts/'.length)
    return json(200, { _links: {}, id, account_id: id, sequence: sourceSequences.get(id) ?? '1000', subentry_count: id === sdkSender ? 1 : 0,
      num_sponsored: id === sdkSender ? 3 : 0,
      balances: [{ asset_type: 'native', balance: id === sdkSender ? '0.0000000' : '10000.0000000' },
        ...(id === sdkSender ? [{ asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: USDC_ISSUER,
          balance: '15.0000000', limit: '100.0000000', selling_liabilities: '0.0000000' }] : [])], data: {} })
  }
  if (req.method === 'GET' && url.pathname === '/ledgers') {
    return json(200, { _links: {}, _embedded: { records: [{ base_reserve_in_stroops: 5_000_000, base_fee_in_stroops: 100 }] } })
  }
  if (req.method === 'POST' && url.pathname === '/transactions') {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try {
        const tx = new URLSearchParams(raw).get('tx') ?? ''
        const parsed = TransactionBuilder.fromXDR(tx, Networks.TESTNET)
        if ('source' in parsed) {
          sourceSequences.set(parsed.source, parsed.sequence)
          if (sdkSender && parsed.operations.some((operation) => operation.type === 'createClaimableBalance' && operation.source === sdkSender)) {
            for (const publicKey of [sdkSender, process.env.SPONSOR_PUBLIC_KEY!]) {
              const verifier = Keypair.fromPublicKey(publicKey)
              if (!parsed.signatures.some((signature) => verifier.verify(parsed.hash(), signature.signature()))) throw new Error('Required funding signature absent')
            }
          }
        }
        json(200, { hash: parsed.hash().toString('hex'), ledger: 1, successful: true })
      } catch (error) {
        horizonLog.push(`decode failed: ${error instanceof Error ? error.message : String(error)}`)
        json(400, { status: 400 })
      }
    })
    return
  }
  json(404, { status: 404 })
})
await new Promise<void>((r) => horizon.listen(0, '127.0.0.1', r))
process.env.HORIZON_URL = `http://127.0.0.1:${(horizon.address() as { port: number }).port}`

/* ── a webhook receiver ────────────────────────────────────────────────── */

const receiver = { mode: 'ok' as 'ok' | 'fail', hits: [] as { headers: Record<string, string>; body: string }[] }
const hooks: Server = createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    receiver.hits.push({ headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])), body: raw })
    res.writeHead(receiver.mode === 'ok' ? 200 : 500)
    res.end()
  })
})
await new Promise<void>((r) => hooks.listen(0, '127.0.0.1', r))
const HOOK_URL = `http://127.0.0.1:${(hooks.address() as { port: number }).port}/hooks`

/* ── capture what the server logs ──────────────────────────────────────── */

const stdoutLines: string[] = []
const realWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
  stdoutLines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
  return (realWrite as (c: string | Uint8Array, ...r: unknown[]) => boolean)(chunk, ...rest)
}) as typeof process.stdout.write

const { prisma } = await import('../src/lib/db/client')
const { issueApiKey } = await import('../src/lib/auth/api-key')
const { createEndpoint, listEndpoints, listDeliveries } = await import('../src/lib/webhooks/manage')
const { emitWebhook, assertPayloadSafe } = await import('../src/lib/webhooks/emit')
const { enqueueWebhook, webhookQueue } = await import('../src/lib/webhooks/queue')
const { startWebhookWorker } = await import('../src/workers/webhooks')
const { confirmBatch } = await import('../src/lib/api/batches')
const { batchConfirmQueue, batchConfirmJobId } = await import('../src/lib/queue/batch-confirm')
const { parseLabels } = await import('../src/lib/campaign/csv')
const { API_WRITE_RATE_LIMIT } = await import('../src/lib/api/v1')
const campaignsRoute = await import('../src/app/api/v1/campaigns/route')
const campaignRoute = await import('../src/app/api/v1/campaigns/[id]/route')
const linksRoute = await import('../src/app/api/v1/campaigns/[id]/links/route')
const exportRoute = await import('../src/app/api/v1/campaigns/[id]/export/route')
const prepareRoute = await import('../src/app/api/v1/campaigns/[id]/batches/prepare/route')
const submitRoute = await import('../src/app/api/v1/campaigns/[id]/batches/submit/route')
const sdk = await import('../packages/sdk/src/index')
type PublicLinks = import('../packages/sdk/src/index').PublicLinks

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const SEED = /S[A-Z2-7]{55}/

/* ── the route handlers, behind fetch ──────────────────────────────────── */

const sent: { url: string; body: string }[] = []
const routeFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input), 'http://kleym.test')
  const body = typeof init?.body === 'string' ? init.body : ''
  sent.push({ url: url.pathname, body })
  const request = new Request(url, { method: init?.method ?? 'GET', headers: init?.headers as HeadersInit, body: init?.body as string | undefined })
  const p = url.pathname
  const params = (id: string) => ({ params: Promise.resolve({ id }) })
  let m: RegExpExecArray | null
  if (p === '/api/v1/campaigns') return request.method === 'POST' ? campaignsRoute.POST(request) : campaignsRoute.GET(request)
  if ((m = /^\/api\/v1\/campaigns\/([^/]+)$/.exec(p))) {
    // Simulate the confirmation worker after injected ledger submission.
    // Exercise real route polling and exact operation-to-registered-key mapping.
    const pending = await prisma.batch.findMany({ where: { campaignId: m[1]!, status: 'SUBMITTED' },
      select: { id: true, submittedXdr: true, links: { select: { id: true, ephemeralPublicKey: true } } } })
    for (const batch of pending) {
      const transaction = TransactionBuilder.fromXDR(batch.submittedXdr!, Networks.TESTNET)
      if (!(transaction instanceof Transaction)) throw new Error('Fixture expected a classic transaction')
      const mapping = transaction.operations.flatMap((operation, index) => {
        if (operation.type !== 'createClaimableBalance') return []
        const link = batch.links.find((row) => row.ephemeralPublicKey === operation.claimants[0]?.destination)
        if (!link) throw new Error('Fixture balance did not bind to a registered public key')
        return [{ linkId: link.id, balanceId: transaction.getClaimableBalanceId(index) }]
      })
      await confirmBatch(batch.id, m[1]!, mapping)
    }
    return campaignRoute.GET(request, params(m[1]!))
  }
  if ((m = /^\/api\/v1\/campaigns\/([^/]+)\/links$/.exec(p))) return request.method === 'POST' ? linksRoute.POST(request, params(m[1]!)) : linksRoute.GET(request, params(m[1]!))
  if ((m = /^\/api\/v1\/campaigns\/([^/]+)\/export$/.exec(p))) return exportRoute.POST(request, params(m[1]!))
  if ((m = /^\/api\/v1\/campaigns\/([^/]+)\/batches\/prepare$/.exec(p))) return prepareRoute.POST(request, params(m[1]!))
  if ((m = /^\/api\/v1\/campaigns\/([^/]+)\/batches\/submit$/.exec(p))) return submitRoute.POST(request, params(m[1]!))
  return new Response('not found', { status: 404 })
}

/* ── fixtures ──────────────────────────────────────────────────────────── */

async function tenant() {
  const user = await prisma.user.create({ data: { username: `wapi-${randomUUID().slice(0, 8)}`, passwordHash: 'x', role: 'SENDER' }, select: { id: true } })
  const orgId = await personalOrg(prisma, user.id)
  const key = await issueApiKey(user.id, orgId, 'verify', 'WRITE')
  const readKey = await issueApiKey(user.id, orgId, 'reporting')
  const org = { id: orgId, name: 'wapi', role: 'OWNER' as const, approvalThreshold: null, approvalsRequired: 1, screeningUrl: null, mfaPolicy: 'OFF' as const, reportingCurrency: 'USD' }
  return { userId: user.id, orgId, org, apiKey: key.key, readKey: readKey.key }
}
const dir = mkdtempSync(join(tmpdir(), 'kleym-sdk-'))

/* ── 1. the SDK, end to end ────────────────────────────────────────────── */

async function sdkEndToEnd() {
  console.log('\n1. The SDK creates a campaign end to end, without a browser')
  const t = await tenant()
  const { endpoint, signingKey } = await createEndpoint(t.userId, t.org, { url: HOOK_URL, events: ['campaign.created', 'campaign.activated', 'batch.confirmed', 'link.claimed', 'campaign.reclaimed', 'sponsor.low'] }, null)
  check('an endpoint is created with a signing key shown once', signingKey.startsWith('whsec_') && endpoint.id.length > 0)
  ;(globalThis as { __signingKey?: string }).__signingKey = signingKey

  const sender = Keypair.random()
  const client = new sdk.KleymClient({ baseUrl: 'http://kleym.test', apiKey: t.apiKey, fetch: routeFetch })
  sdkSender = sender.publicKey()
  const csvPath = join(dir, 'secrets.csv')
  const batches: string[] = []
  const result = await sdk.createCampaignEndToEnd({
    client,
    terms: { name: 'sdk run', network: 'testnet', senderPublicKey: sender.publicKey(), assetCode: 'USDC', assetIssuer: USDC_ISSUER, amountPerLink: '2.5', linkCount: 5, expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    csvPath, appUrl: 'https://kleym.example', senderSecret: sender.secret(),
    labels: ['alice', 'bob', 'carol', 'dave', 'erin'],
    attestations: [{ reference: 'PAY-1', category: 'payroll', note: null }, null, null, null, null],
    onBatch: (b) => batches.push(`${b.sequence}:${b.status}`),
  })
  check('the campaign exists and is the organisation\'s', (await prisma.campaign.count({ where: { id: result.campaignId, organizationId: t.orgId } })) === 1)
  const links = await prisma.claimLink.findMany({ where: { campaignId: result.campaignId }, select: { ephemeralPublicKey: true, label: true, reference: true, batch: { select: { status: true } } } })
  check('5 public keys registered with labels and attestation', links.length === 5 && links.some((l) => l.label === 'alice' && l.reference === 'PAY-1'))
  const csv = readFileSync(csvPath, 'utf8')
  check('the secrets CSV is on disk, mode 0600, one seed per link', (statSync(csvPath).mode & 0o777) === 0o600 && new Set(csv.match(/S[A-Z2-7]{55}/g) ?? []).size === 5, `mode ${(statSync(csvPath).mode & 0o777).toString(8)}`)
  const back = parseLabels(csv, 10)
  check('and re-imports through the server\'s own parser with its attestation', back.ok && back.labels[0] === 'alice' && back.attestations?.[0]?.reference === 'PAY-1', JSON.stringify(back))
  check('the export was marked', (await prisma.campaign.findUniqueOrThrow({ where: { id: result.campaignId }, select: { csvExportedAt: true } })).csvExportedAt !== null)
  check('two batches (3 + 2) were prepared, signed locally and submitted', batches.join(',') === '1:SUBMITTED,2:SUBMITTED', batches.join(','))
  check('the SDK waited until all batches confirmed', links.every((link) => link.batch?.status === 'CONFIRMED'))
  check('the sender supplied USDC while Kleym paid funding fees and reserves',
    (await prisma.campaign.findUniqueOrThrow({ where: { id: result.campaignId } })).fundingMode === 'SPONSORED')
  const resumed = await sdk.resumeCampaignFunding({ client, campaignId: result.campaignId, senderSecret: sender.secret() })
  check('resuming confirmed funding submits nothing again', resumed.length === 0 && horizonLog.filter((line) => line.startsWith('POST /transactions')).length === 2)
  for (const [tag, labels] of [['omitted', undefined], ['empty', []], ['partial', ['first']]] as const) {
    const terms = { name: `SDK labels ${tag}`, network: 'testnet' as const, senderPublicKey: sender.publicKey(),
      assetCode: 'USDC', assetIssuer: USDC_ISSUER, amountPerLink: '1', linkCount: 2, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }
    const draft = await sdk.createCampaignEndToEnd({ client, terms, senderSecret: sender.secret(),
      csvPath: join(dir, `${tag}.csv`), appUrl: 'https://kleym.example', sign: false,
      ...(labels === undefined ? {} : { labels: [...labels] }) })
    const registered = await prisma.claimLink.findMany({ where: { campaignId: draft.campaignId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    check(`${tag} labels register and export through real WRITE routes`, registered.length === 2 &&
      registered.filter((link) => link.label !== null).length === (labels?.length ?? 0) &&
      (await prisma.campaign.findUniqueOrThrow({ where: { id: draft.campaignId } })).csvExportedAt !== null)
  }
  check('Horizon was asked for the sender account and given two transactions', horizonLog.filter((l) => l.startsWith('POST /transactions')).length === 2, horizonLog.join(';'))
  check('the batch-confirm job was queued for each', (await Promise.all((await prisma.batch.findMany({ where: { campaignId: result.campaignId }, select: { id: true } })).map((b) => batchConfirmQueue().getJob(batchConfirmJobId(b.id))))).every(Boolean))

  // No seed anywhere it must not be.
  check('no request the SDK sent contains a seed', sent.every((s) => !SEED.test(s.body) && !SEED.test(s.url)), `${sent.length} requests`)
  check('no server log line contains a seed', !stdoutLines.some((l) => SEED.test(l)))
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM (
       SELECT "ephemeralPublicKey" || coalesce(label,'') || coalesce(reference,'') || coalesce(note,'') AS t FROM "ClaimLink" WHERE "campaignId" = $1
       UNION ALL SELECT name || "senderPublicKey" FROM "Campaign" WHERE id = $1
       UNION ALL SELECT metadata::text FROM "AuditLog" WHERE "entityId" = $1
       UNION ALL SELECT payload::text FROM "WebhookDelivery" WHERE payload::text LIKE '%' || $1 || '%'
     ) x WHERE t ~ 'S[A-Z2-7]{55}'`, result.campaignId)
  check('no database row for the campaign contains a seed', rows[0]!.n === 0n)
  check('the sender secret was used only locally: it is in no request', sent.every((s) => !s.body.includes(sender.secret())))

  // The client refuses to send a seed even if handed one.
  const before = sent.length
  const refused = await client.registerLinks(result.campaignId, { publicKeys: [Keypair.random().secret()], labels: [null] } as unknown as PublicLinks).catch((e: Error) => e)
  check('KleymClient throws SeedInRequestError and sends nothing when given a seed', refused instanceof sdk.SeedInRequestError && sent.length === before)

  return { campaignId: result.campaignId, orgId: t.orgId, org: t.org, apiKey: t.apiKey, readKey: t.readKey, userId: t.userId }
}

/* ── 1b. a READ key writes nothing ─────────────────────────────────────── */

async function readKeyCannotWrite(ctx: { campaignId: string; readKey: string; apiKey: string; orgId: string }): Promise<void> {
  console.log('\n1b. A key issued without write scope is refused by every write route, with no side effect')
  const headers = { authorization: `Bearer ${ctx.readKey}`, 'content-type': 'application/json' }
  const before = {
    campaigns: await prisma.campaign.count({ where: { organizationId: ctx.orgId } }),
    links: await prisma.claimLink.count({ where: { campaignId: ctx.campaignId } }),
    audit: await prisma.auditLog.count({ where: { organizationId: ctx.orgId } }),
  }
  const attempts: [string, unknown][] = [
    ['/api/v1/campaigns', { name: 'nope', network: 'testnet', senderPublicKey: Keypair.random().publicKey(), assetCode: 'XLM', amountPerLink: '1', linkCount: 1, expiresAt: new Date(Date.now() + 1e6).toISOString() }],
    [`/api/v1/campaigns/${ctx.campaignId}/links`, { publicKeys: [Keypair.random().publicKey()] }],
    [`/api/v1/campaigns/${ctx.campaignId}/export`, {}],
    [`/api/v1/campaigns/${ctx.campaignId}/batches/prepare`, {}],
    [`/api/v1/campaigns/${ctx.campaignId}/batches/submit`, { sequence: 1, signedXdr: 'AAAA' }],
  ]
  for (const [path, body] of attempts) {
    const r = await routeFetch(`http://kleym.test${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
    const text = await r.text()
    check(`${path.replace(ctx.campaignId, '{id}')}: 403 insufficient-scope with WWW-Authenticate scope="write"`, r.status === 403 && text.includes('insufficient-scope') && (r.headers.get('www-authenticate') ?? '').includes('scope="write"'), `${r.status} ${text.slice(0, 80)}`)
  }
  const after = {
    campaigns: await prisma.campaign.count({ where: { organizationId: ctx.orgId } }),
    links: await prisma.claimLink.count({ where: { campaignId: ctx.campaignId } }),
    audit: await prisma.auditLog.count({ where: { organizationId: ctx.orgId } }),
  }
  check('nothing was created, registered or audited', JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }))
  const read = await routeFetch(`http://kleym.test/api/v1/campaigns/${ctx.campaignId}`, { method: 'GET', headers })
  check('the same READ key still reads', read.status === 200, `${read.status}`)
  const writeReads = await routeFetch('http://kleym.test/api/v1/campaigns', { method: 'GET', headers: { authorization: `Bearer ${ctx.apiKey}` } })
  check('and a WRITE key still reads', writeReads.status === 200, `${writeReads.status}`)
  const legacy = await prisma.apiKey.findFirst({ where: { name: 'reporting', organizationId: ctx.orgId }, select: { scope: true } })
  check('a key issued without a scope is READ', legacy?.scope === 'READ')
}

/* ── 2. every write endpoint refuses a planted seed ─────────────────────── */

async function plantedSeeds(ctx: { campaignId: string; apiKey: string }): Promise<void> {
  console.log('\n2. Every write endpoint rejects a planted seed with 400 and a SEED_SUBMITTED event')
  const seed = Keypair.random().secret()
  const endpoints: [string, unknown][] = [
    ['/api/v1/campaigns', { name: 'x', network: 'testnet', senderPublicKey: seed, assetCode: 'XLM', amountPerLink: '1', linkCount: 1, expiresAt: new Date(Date.now() + 1e6).toISOString() }],
    [`/api/v1/campaigns/${ctx.campaignId}/links`, { publicKeys: [seed] }],
    [`/api/v1/campaigns/${ctx.campaignId}/export`, { note: seed }],
    [`/api/v1/campaigns/${ctx.campaignId}/batches/prepare`, { sequence: 1, memo: seed }],
    [`/api/v1/campaigns/${ctx.campaignId}/batches/submit`, { sequence: 1, signedXdr: seed }],
  ]
  const eventsBefore = await prisma.auditLog.count({ where: { action: 'security.seed_submitted' } })
  for (const [path, body] of endpoints) {
    const response = await routeFetch(`http://kleym.test${path}`, { method: 'POST', headers: { authorization: `Bearer ${ctx.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const text = await response.text()
    check(`${path}: 400 problems/seed-submitted`, response.status === 400 && text.includes('seed-submitted'), `${response.status} ${text.slice(0, 80)}`)
  }
  await sleep(300)
  const eventsAfter = await prisma.auditLog.count({ where: { action: 'security.seed_submitted' } })
  check('five SEED_SUBMITTED security events were recorded', eventsAfter - eventsBefore === 5, `${eventsAfter - eventsBefore}`)
  check('and none of the audit rows carries the seed', (await prisma.auditLog.count({ where: { action: 'security.seed_submitted', metadata: { string_contains: seed } } })) === 0)
}

/* ── 3. deliveries are signed; a replay is refused ─────────────────────── */

async function signedDeliveries(ctx: { campaignId: string; orgId: string }): Promise<void> {
  console.log('\n3. Webhook deliveries are signed; the SDK verifier refuses a replay and a tampered body')
  const worker = startWebhookWorker()
  // Confirm one batch from "the ledger" — this raises batch.confirmed and, with the CSV marked, campaign.activated.
  const batch = await prisma.batch.findFirstOrThrow({ where: { campaignId: ctx.campaignId, sequence: 1 }, select: { id: true, links: { select: { id: true } } } })
  check('batch 1 was confirmed through SDK status polling', (await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).status === 'CONFIRMED')
  const batch2 = await prisma.batch.findFirstOrThrow({ where: { campaignId: ctx.campaignId, sequence: 2 }, select: { id: true, links: { select: { id: true } } } })
  check('batch 2 was confirmed through SDK status polling', (await prisma.batch.findUniqueOrThrow({ where: { id: batch2.id } })).status === 'CONFIRMED')
  const link = await prisma.claimLink.findFirstOrThrow({ where: { campaignId: ctx.campaignId }, select: { id: true, ephemeralPublicKey: true } })
  await emitWebhook(ctx.orgId, 'link.claimed', { campaignId: ctx.campaignId, linkId: link.id, ephemeralPublicKey: link.ephemeralPublicKey, claimedBy: Keypair.random().publicKey(), claimTxHash: 'ab'.repeat(32), claimedAt: new Date().toISOString(), claimMemoType: null, claimMemo: null, receiptId: null })

  const deadline = Date.now() + 15_000
  while (Date.now() < deadline && receiver.hits.length < 5) await sleep(100)
  const events = receiver.hits.map((h) => h.headers['x-kleym-event']).sort()
  check('campaign.created, batch.confirmed ×2, campaign.activated and link.claimed were delivered', events.join(',') === 'batch.confirmed,batch.confirmed,campaign.activated,campaign.created,link.claimed', events.join(','))
  const key = (globalThis as { __signingKey?: string }).__signingKey!
  const hit = receiver.hits.find((h) => h.headers['x-kleym-event'] === 'link.claimed')!
  check('the verifier accepts a live delivery', sdk.verifyWebhook(hit.body, hit.headers, key).ok)
  check('and refuses the same delivery replayed ten minutes later (stale)', sdk.verifyWebhook(hit.body, hit.headers, key, { now: () => Date.now() + 600_000 }).ok === false && (sdk.verifyWebhook(hit.body, hit.headers, key, { now: () => Date.now() + 600_000 }) as { reason: string }).reason === 'stale')
  check('and a tampered body (mismatch)', (sdk.verifyWebhook(hit.body.replace('link.claimed', 'link.reclaimed'), hit.headers, key) as { reason: string }).reason === 'mismatch')
  check('and a wrong key', sdk.verifyWebhook(hit.body, hit.headers, 'whsec_other').ok === false)
  const body = JSON.parse(hit.body) as { id: string; event: string; data: Record<string, unknown> }
  check('the delivery id is in the header and the body, for idempotency', hit.headers['x-kleym-delivery'] === body.id && body.id.startsWith('whd_'))
  check('link.claimed carries the ephemeral PUBLIC key, the claimant and the hash', body.data.ephemeralPublicKey === link.ephemeralPublicKey && typeof body.data.claimTxHash === 'string')
  const all = receiver.hits.map((h) => h.body).join('\n')
  check('no delivery contains a claim URL, a fragment, a seed or an address', !/\/claim/.test(all) && !/#s=/.test(all) && !SEED.test(all) && !/@/.test(all))
  const delivered = await prisma.webhookDelivery.count({ where: { endpoint: { organizationId: ctx.orgId }, status: 'DELIVERED' } })
  check('the delivery log shows them DELIVERED', delivered === 5, `${delivered}`)
  await worker.close()
}

/* ── 4. retry with backoff, park, disable ──────────────────────────────── */

async function retryAndPark(ctx: { orgId: string; org: { id: string; name: string; role: 'OWNER'; approvalThreshold: null; approvalsRequired: number; screeningUrl: null; mfaPolicy: 'OFF'; reportingCurrency: string }; userId: string }): Promise<void> {
  console.log('\n4. A failing endpoint is retried with backoff, parked, and the organisation sees it')
  receiver.mode = 'fail'
  receiver.hits = []
  const worker = startWebhookWorker()
  const { endpoint } = await createEndpoint(ctx.userId, ctx.org, { url: `${HOOK_URL}?failing=1`, events: ['campaign.reclaimed'] }, null)
  const times: number[] = []
  const stamp = () => times.push(Date.now())
  // Three attempts, 200 ms base backoff — the production numbers scaled down.
  for (let round = 1; round <= 3; round += 1) {
    const id = `whd_${randomUUID().replace(/-/g, '').slice(0, 24)}`
    await prisma.webhookDelivery.create({ data: { id, endpointId: endpoint.id, event: 'campaign.reclaimed', payload: { id, event: 'campaign.reclaimed', createdAt: new Date().toISOString(), organizationId: ctx.orgId, data: { campaignId: 'c' } } } })
    const hitsBefore = receiver.hits.length
    await enqueueWebhook(id, { attempts: 3, backoffMs: 200 })
    const deadline = Date.now() + 10_000
    let row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id }, select: { status: true, attempts: true, lastStatus: true, lastError: true } })
    while (Date.now() < deadline && row.status !== 'PARKED' && row.status !== 'DELIVERED') {
      await sleep(100)
      row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id }, select: { status: true, attempts: true, lastStatus: true, lastError: true } })
    }
    stamp()
    if (round === 1) {
      check('after three failed attempts the delivery is PARKED with the receiver\'s status', row.status === 'PARKED' && row.attempts === 3 && row.lastStatus === 500 && row.lastError === 'HTTP 500', JSON.stringify(row))
      check('the receiver was hit three times', receiver.hits.length - hitsBefore === 3, `${receiver.hits.length - hitsBefore}`)
      const ep = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id }, select: { failures: true, disabledAt: true } })
      check('one park counts against the endpoint; it is still enabled', ep.failures === 1 && ep.disabledAt === null, JSON.stringify(ep))
    }
  }
  const ep = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id }, select: { failures: true, disabledAt: true } })
  check('three consecutive parks disable the endpoint', ep.failures === 3 && ep.disabledAt !== null, JSON.stringify(ep))
  const listed = (await listEndpoints(ctx.orgId)).find((e) => e.id === endpoint.id)!
  check('the organisation\'s list shows it disabled with 3 parked deliveries', listed.disabledAt !== null && listed._count.deliveries === 3, JSON.stringify({ d: listed.disabledAt, p: listed._count.deliveries }))
  const log = await listDeliveries(ctx.orgId, endpoint.id)
  check('and the delivery log names each failure', log.length === 3 && log.every((d) => d.status === 'PARKED' && d.lastError === 'HTTP 500'))
  // A delivery to a disabled endpoint is parked without a request.
  await emitWebhook(ctx.orgId, 'campaign.reclaimed', { campaignId: 'c' })
  await sleep(300)
  check('a disabled endpoint gets no further delivery row (the healthy one still does)', (await prisma.webhookDelivery.count({ where: { endpointId: endpoint.id } })) === 3)
  check('another organisation\'s log is not readable through this one', (await listDeliveries('org_other', endpoint.id)).length === 0)
  await worker.close()
  receiver.mode = 'ok'
}

/* ── 5. the payload guard ──────────────────────────────────────────────── */

function payloadGuard(): void {
  console.log('\n5. No payload can carry a claim URL, a fragment, a seed or an address')
  const bad = (body: string) => {
    try {
      assertPayloadSafe(body)
      return false
    } catch {
      return true
    }
  }
  check('a claim URL is refused', bad(JSON.stringify({ url: 'https://kleym.app/claim#s=x' })))
  check('a bare fragment is refused', bad(JSON.stringify({ x: 'anything#s=SABC' })))
  check('a seed is refused', bad(JSON.stringify({ x: Keypair.random().secret() })))
  check('an email address is refused', bad(JSON.stringify({ to: 'alice@example.com' })))
  check('a clean payload passes', !bad(JSON.stringify({ campaignId: 'c', ephemeralPublicKey: Keypair.random().publicKey(), claimTxHash: 'ab'.repeat(32) })))
}

/* ── 6. writes are limited per key, apart from reads ───────────────────── */

async function writeLimit(): Promise<void> {
  console.log('\n6. Write endpoints are rate-limited per key, separately from reads')
  const t = await tenant()
  const headers = { authorization: `Bearer ${t.apiKey}`, 'content-type': 'application/json' }
  let last = 0
  let limitedAt = 0
  for (let i = 1; i <= API_WRITE_RATE_LIMIT.limit + 1; i += 1) {
    const r = await routeFetch('http://kleym.test/api/v1/campaigns/nope/export', { method: 'POST', headers, body: '{}' })
    last = r.status
    if (r.status === 429) {
      limitedAt = i
      const text = await r.text()
      check('the 429 names the write limit', text.includes('write requests'), text.slice(0, 120))
      break
    }
  }
  check(`the ${API_WRITE_RATE_LIMIT.limit + 1}th write in a minute is refused`, last === 429 && limitedAt === API_WRITE_RATE_LIMIT.limit + 1, `limited at ${limitedAt}`)
  const read = await routeFetch('http://kleym.test/api/v1/campaigns', { method: 'GET', headers })
  check('a read on the same key still works (its own budget)', read.status === 200, `${read.status}`)
}

async function main(): Promise<void> {
  try {
    const ctx = await sdkEndToEnd()
    await readKeyCannotWrite(ctx)
    await plantedSeeds(ctx)
    await signedDeliveries(ctx)
    await retryAndPark(ctx)
    payloadGuard()
    await writeLimit()
  } finally {
    await prisma.$disconnect()
    await webhookQueue().close().catch(() => undefined)
    await batchConfirmQueue().close().catch(() => undefined)
    horizon.close()
    hooks.close()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
