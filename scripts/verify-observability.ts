/**
 * Verification for observability (#53). Real Postgres and Redis, with the
 * OpenTelemetry SDK exporting into memory so what was emitted can be read
 * back exactly.
 *
 * What is proven: a claim's phases are spans under the trace the browser
 * started; a worker job's span joins the trace of the request that enqueued
 * it; every metric in the set is emitted under the condition it exists to
 * make visible — a stalled queue with no worker, a sponsor below threshold,
 * a pass that could not finish, stranded reserve, a slow confirm, the
 * limiter counting by route and failing closed when Redis is gone — and no
 * span attribute or label survives with key material in it. The status
 * snapshot reports a dead dependency live.
 *
 * Run: pnpm verify:observability
 */
import { randomUUID } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { context, propagation } from '@opentelemetry/api'
import { InMemoryMetricExporter, PeriodicExportingMetricReader, AggregationTemporality, type DataPoint } from '@opentelemetry/sdk-metrics'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()
// A Horizon nobody answers: the dependency is DOWN, and every ledger read fails fast.
process.env.HORIZON_URL = 'https://127.0.0.1:9'

const { startTelemetry, stopTelemetry } = await import('../src/lib/observability/telemetry')
const spans = new InMemorySpanExporter()
const metricsOut = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
const reader = new PeriodicExportingMetricReader({ exporter: metricsOut, exportIntervalMillis: 60_000 })
startTelemetry({ serviceName: 'kleym-verify', spanProcessors: [new SimpleSpanProcessor(spans)], metricReader: reader })

const { prisma } = await import('../src/lib/db/client')
const { redis } = await import('../src/lib/redis/client')
const { resolveLink, prepareMaterialise, submitClaim } = await import('../src/lib/api/claims')
const { rateLimit } = await import('../src/lib/auth/rate-limit')
const { confirmBatch } = await import('../src/lib/api/batches')
const { recordPassReport } = await import('../src/lib/queue/pass-report')
const { enqueueBatchConfirm, batchConfirmQueue, batchConfirmJobId } = await import('../src/lib/queue/batch-confirm')
const { expiryJobs } = await import('../src/lib/queue/maintenance')
const { startBatchConfirmWorker } = await import('../src/workers/batch-confirm')
const { observeWorker } = await import('../src/lib/observability/workers')
const { registerObservables, METRIC } = await import('../src/lib/observability/metrics')
const { withSpan } = await import('../src/lib/observability/tracing')
const { computeStatus, computeOperatorStatus, statusSnapshot, operatorStatus, queueReadings, sponsorReadings, strandedReading, passReadings, dependencyReadings } = await import('../src/lib/observability/status')
const Decimal = (await import('decimal.js')).default

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ── reading what was exported ─────────────────────────────────────────── */

async function collect() {
  await reader.forceFlush()
  const all = metricsOut.getMetrics()
  return all.at(-1)!
}
async function points(name: string): Promise<DataPoint<number | { sum?: number; count: number }>[]> {
  const rm = await collect()
  for (const scope of rm.scopeMetrics) {
    for (const m of scope.metrics) {
      if (m.descriptor.name === name) return m.dataPoints as DataPoint<number | { sum?: number; count: number }>[]
    }
  }
  return []
}
const withAttrs = (dps: DataPoint<unknown>[], attrs: Record<string, unknown>) =>
  dps.filter((d) => Object.entries(attrs).every(([k, v]) => d.attributes[k] === v))
const valueOf = (d: DataPoint<unknown> | undefined): number | null => {
  if (!d) return null
  const v = d.value as number | { sum?: number }
  return typeof v === 'number' ? v : (v.sum ?? null)
}

/* ── fixtures ──────────────────────────────────────────────────────────── */

async function makeUser() {
  const user = await prisma.user.create({ data: { username: `obs-${randomUUID().slice(0, 8)}`, passwordHash: 'x', role: 'SENDER' }, select: { id: true } })
  await personalOrg(prisma, user.id)
  return user.id
}
async function campaignWithLink(userId: string, linkStatus: 'ACTIVE' | 'PENDING' = 'ACTIVE') {
  const campaign = await prisma.campaign.create({
    data: {
      userId, organizationId: `org_${userId}`, name: 'obs', network: 'testnet', senderPublicKey: Keypair.random().publicKey(),
      assetCode: 'XLM', amountPerLink: '2.5', linkCount: 1, expiresAt: new Date(Date.now() + 86_400_000), status: 'ACTIVE', csvExportedAt: new Date(),
    },
    select: { id: true },
  })
  const ephemeral = Keypair.random().publicKey()
  const link = await prisma.claimLink.create({
    data: { campaignId: campaign.id, ephemeralPublicKey: ephemeral, status: linkStatus, balanceId: linkStatus === 'ACTIVE' ? `00000000${randomUUID().replace(/-/g, '')}${'0'.repeat(32)}`.slice(0, 72) : null },
    select: { id: true },
  })
  return { campaignId: campaign.id, linkId: link.id, ephemeral }
}

/* ── 1. one trace across the claim, started by the browser ─────────────── */

async function claimTrace(): Promise<void> {
  console.log('\n1. A trace spans the claim: resolve, prepare, submit, under the browser\'s traceparent')
  const userId = await makeUser()
  const { ephemeral } = await campaignWithLink(userId)
  const traceId = randomUUID().replace(/-/g, '')
  const traceparent = `00-${traceId}-${'ab'.repeat(8)}-01`
  const incoming = propagation.extract(context.active(), { traceparent })
  spans.reset()

  await context.with(incoming, async () => {
    await resolveLink(ephemeral)
    await prepareMaterialise(ephemeral).catch(() => undefined)
    await submitClaim(ephemeral, 'AAAA', 'claim').catch(() => undefined)
  })
  const finished = spans.getFinishedSpans()
  const names = finished.map((s) => s.name)
  check('one span per phase', ['claim.resolve', 'claim.materialise', 'claim.submit'].every((n) => names.includes(n)), names.join(','))
  check('all under the trace the browser started', finished.every((s) => s.spanContext().traceId === traceId))
  check('each with a phase and an outcome (a throw is outcome=error)', finished.every((s) => typeof s.attributes.phase === 'string' && typeof s.attributes.outcome === 'string'), JSON.stringify(finished.map((s) => s.attributes)))
  const dump = JSON.stringify(finished.map((s) => [s.name, s.attributes, s.events]))
  check('and nothing that identifies the link: no ephemeral key, no envelope', !dump.includes(ephemeral) && !dump.includes('AAAA'))
  const outcomes = await points(METRIC.claimOutcomes)
  check('claim outcomes counted by phase', valueOf(withAttrs(outcomes, { phase: 'resolve', outcome: 'claimable' })[0]) === 1 && withAttrs(outcomes, { phase: 'materialise' }).length === 1, JSON.stringify(outcomes.map((d) => [d.attributes, d.value])))
  const submit = withAttrs(outcomes, { phase: 'submit' })
  check('a submit that could not reach the ledger counts as its own outcome', submit.length === 1 && ['unavailable', 'error', 'conflict', 'not-found'].includes(String(submit[0]!.attributes.outcome)), JSON.stringify(submit.map((d) => d.attributes)))
}

/* ── 2. the worker joins the enqueuing request's trace ─────────────────── */

async function workerTrace(): Promise<void> {
  console.log('\n2. A worker job is a child of the request that enqueued it')
  spans.reset()
  const worker = observeWorker(startBatchConfirmWorker())
  const batchId = `obs-${randomUUID()}`
  let traceId = ''
  await withSpan('request.submit', { route: '/api/campaigns/[id]/batches/submit' }, async (span) => {
    traceId = span.spanContext().traceId
    await enqueueBatchConfirm(batchId)
  })
  const job = await batchConfirmQueue().getJob(batchConfirmJobId(batchId))
  check('enqueueBatchConfirm accepts the id (BullMQ 6 refused the old colon form)', job !== undefined)
  check('the job carries a traceparent, and nothing else new', !!job?.data.trace?.traceparent && Object.keys(job!.data).sort().join(',') === 'batchId,trace', JSON.stringify(job?.data))
  // Wait for the first attempt: the batch does not exist, so it fails fast.
  const deadline = Date.now() + 15_000
  // Ours by batch id: another script may have left real batch-confirm jobs in the queue.
  const ours = () => spans.getFinishedSpans().find((s) => s.name === 'job.batch-confirm' && s.attributes.batchId === batchId)
  while (Date.now() < deadline && !ours()) await sleep(100)
  const jobSpan = ours()
  check('the worker span exists', !!jobSpan)
  check('in the same trace as the request', jobSpan?.spanContext().traceId === traceId)
  check('with the queue and batch id, and an attempt number', jobSpan?.attributes.queue === 'batch-confirm' && jobSpan?.attributes.batchId === batchId && jobSpan?.attributes.attempt === 1, JSON.stringify(jobSpan?.attributes))
  await sleep(300)
  const durations = await points(METRIC.jobDuration)
  check('the job\'s duration was recorded as failed for its queue', withAttrs(durations, { queue: 'batch-confirm', outcome: 'failed' }).length >= 1, JSON.stringify(durations.map((d) => d.attributes)))
  await job?.remove().catch(() => undefined)
  await worker.close()
}

/* ── 3. every metric, under the condition it exists for ────────────────── */

async function forcedConditions(): Promise<void> {
  console.log('\n3. Each metric is emitted under the failure it makes visible')
  const stub = new Map<string, InstanceType<typeof Decimal>>()
  registerObservables({
    queues: queueReadings,
    sponsors: () => sponsorReadings(async (pk) => stub.get(pk) ?? new Decimal(1000)),
    stranded: strandedReading,
    passes: passReadings,
    dependencies: dependencyReadings,
  })

  // A queue nobody drains: jobs wait, and the oldest one ages.
  const stalled = expiryJobs()
  const jobId = `obs-stall-${randomUUID()}`
  await stalled.add('expiry-sweep', {}, { jobId })
  await sleep(1100)
  const depth = await points(METRIC.queueDepth)
  const waiting = valueOf(withAttrs(depth, { queue: 'expiry-sweep', state: 'waiting' })[0])
  const oldest = valueOf(withAttrs(await points(METRIC.queueOldestWaiting), { queue: 'expiry-sweep' })[0])
  check('a killed worker shows as depth on its queue', (waiting ?? 0) >= 1, `waiting=${waiting}`)
  check('and as the oldest job ageing', (oldest ?? 0) >= 1, `oldest=${oldest}s`)
  await (await stalled.getJob(jobId))?.remove()

  // A sponsor below the alert threshold.
  const { sponsorPool } = await import('../src/lib/stellar/sponsors')
  const primary = sponsorPool()[0]!.publicKey
  stub.set(primary, new Decimal(3))
  const spendable = valueOf(withAttrs(await points(METRIC.sponsorSpendable), { sponsor: primary })[0])
  check('sponsor spendable is a gauge keyed by the (public) sponsor key', spendable === 3, `spendable=${spendable}`)
  const runway = valueOf(withAttrs(await points(METRIC.sponsorRunway), { sponsor: primary })[0])
  check('and runway is emitted alongside', runway !== null, `runway=${runway}`)

  // A pass that could not finish.
  await recordPassReport({ job: 'reconcile', finishedAt: new Date().toISOString(), checked: 500, remaining: 7, limit: 500, intervalMs: 300_000 })
  const passes = await points(METRIC.reconcilePasses)
  check('an incomplete pass is counted as incomplete', valueOf(withAttrs(passes, { job: 'reconcile', outcome: 'incomplete' })[0]) === 1, JSON.stringify(passes.map((d) => [d.attributes, d.value])))
  const remaining = valueOf(withAttrs(await points(METRIC.reconcileRemaining), { job: 'reconcile' })[0])
  check('and its shortfall is the remaining gauge', remaining === 7, `remaining=${remaining}`)
  await recordPassReport({ job: 'reconcile', finishedAt: new Date().toISOString(), checked: 7, remaining: 0, limit: 500, intervalMs: 300_000 })
  check('a complete pass is counted as complete', valueOf(withAttrs(await points(METRIC.reconcilePasses), { job: 'reconcile', outcome: 'complete' })[0]) === 1)

  // Stranded reserve.
  const userId = await makeUser()
  const a = await campaignWithLink(userId, 'PENDING')
  const b = await campaignWithLink(userId, 'PENDING')
  await prisma.strandedAccount.createMany({
    data: [
      { linkId: a.linkId, campaignId: a.campaignId, ephemeralPublicKey: a.ephemeral, lockedReserve: '1.5', detail: 'obs', lastLedgerActivity: new Date(), critical: false },
      { linkId: b.linkId, campaignId: b.campaignId, ephemeralPublicKey: b.ephemeral, lockedReserve: '2.25', detail: 'obs', lastLedgerActivity: new Date(), critical: true },
    ],
  })
  const reserve = valueOf((await points(METRIC.strandedReserve))[0])
  const criticalCount = valueOf(withAttrs(await points(METRIC.strandedAccounts), { state: 'critical' })[0])
  check('stranded reserve is the sum of locked XLM', reserve !== null && reserve >= 3.75, `reserve=${reserve}`)
  check('and critical accounts are counted apart', criticalCount !== null && criticalCount >= 1, `critical=${criticalCount}`)

  // A slow confirm: submitted 30 s ago, confirmed now.
  const c = await campaignWithLink(userId, 'PENDING')
  const batch = await prisma.batch.create({ data: { campaignId: c.campaignId, sequence: 1, status: 'SUBMITTED', transactionHash: randomUUID().replace(/-/g, '').repeat(2), submittedAt: new Date(Date.now() - 30_000) }, select: { id: true } })
  await confirmBatch(batch.id, c.campaignId, [{ linkId: c.linkId, balanceId: `00000000${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}` }])
  const latency = (await points(METRIC.batchConfirmLatency))[0]
  const sum = valueOf(latency)
  check('batch confirm latency is a histogram of submit-to-confirm seconds', sum !== null && sum >= 29 && sum <= 40 && latency?.attributes.network === 'testnet', `sum=${sum}`)

  // The limiter, counting by route and never by caller.
  // A fresh caller per run: the window outlives the script.
  const caller = `203.0.113.${Math.floor(Math.random() * 250)}-${randomUUID().slice(0, 4)}`
  await rateLimit(`claims:submit:${caller}`, 1, 60)
  await rateLimit(`claims:submit:${caller}`, 1, 60)
  const rejections = await points(METRIC.rateLimitRejections)
  const byRoute = withAttrs(rejections, { route: 'claims:submit', reason: 'limit' })
  check('a rate-limited request is counted by route', valueOf(byRoute[0]) === 1, JSON.stringify(rejections.map((d) => [d.attributes, d.value])))
  check('with no address in any label', !JSON.stringify(rejections.map((d) => d.attributes)).includes('203.0.113'))

  // Dependencies: Horizon is a closed port for this whole script.
  const up = await points(METRIC.dependencyUp)
  check('the dependency gauge reads horizon=0 and postgres=1', valueOf(withAttrs(up, { dependency: 'horizon' })[0]) === 0 && valueOf(withAttrs(up, { dependency: 'postgres' })[0]) === 1, JSON.stringify(up.map((d) => [d.attributes, d.value])))

  // No label anywhere carries key material or a claim-path identifier.
  const rm = await collect()
  const allLabels = JSON.stringify(rm.scopeMetrics.flatMap((s) => s.metrics.flatMap((m) => m.dataPoints.map((d) => d.attributes))))
  check('no metric label carries a seed, a fragment or a non-sponsor public key', !/S[A-Z2-7]{55}/.test(allLabels) && !allLabels.includes('#s=') && !allLabels.includes(a.ephemeral) && !allLabels.includes(c.ephemeral))
}

/* ── 4. the allowlist on spans ─────────────────────────────────────────── */

async function plantedAttributes(): Promise<void> {
  console.log('\n4. A planted seed, fragment or ephemeral key never reaches a span')
  spans.reset()
  const seed = Keypair.random().secret()
  const pk = Keypair.random().publicKey()
  await withSpan('planted', { phase: 'submit', reason: seed, route: `/claim#s=${seed}`, campaignId: pk, ephemeralPublicKey: pk, signedXdr: 'AAAA'.repeat(40) }, async () => undefined)
  const span = spans.getFinishedSpans()[0]!
  const dump = JSON.stringify(span.attributes)
  check('only the allowlisted, clean attribute survived', Object.keys(span.attributes).join(',') === 'phase', dump)
  check('and nothing planted is in the span', !dump.includes(seed) && !dump.includes(pk) && !dump.includes('AAAA'))
}

/* ── 5. the status page, fed live ──────────────────────────────────────── */

async function statusPage(): Promise<void> {
  console.log('\n5. The status snapshot reflects a dead dependency now, not after a cache')
  const status = await computeStatus(new Date(), { sponsorRead: async () => new Decimal(1000) })
  const horizon = status.components.find((c) => c.name.includes('Horizon'))
  check('Horizon is reported down', horizon?.state === 'down', JSON.stringify(status.components))
  check('the database is reported operational, with no host', status.components.find((c) => c.name === 'Database')?.state === 'operational' && !JSON.stringify(status).includes('localhost') && !JSON.stringify(status).includes('127.0.0.1'))
  check('overall is down', status.overall === 'down')
  const low = await computeStatus(new Date(), { sponsorRead: async () => new Decimal(1) })
  const sponsorship = low.components.find((c) => c.name === 'Claim sponsorship')
  check('a sponsor below threshold degrades claim sponsorship', sponsorship?.state === 'degraded', JSON.stringify(low.components))
  check('but the public note does not say why', !/sponsor|threshold|float|balance/i.test(sponsorship?.note ?? '') && sponsorship?.note === 'reduced capacity', sponsorship?.note)
  check('no tenant data in the snapshot: no campaign ids, no addresses', !/c[a-z0-9]{24}/.test(JSON.stringify(status.components)) && !/G[A-Z2-7]{55}/.test(JSON.stringify(status)))
  // The public snapshot is names and states. No number of anything.
  const publicKeys = Object.keys(low).sort().join(',')
  check('the public snapshot has only generatedAt, overall and components', publicKeys === 'components,generatedAt,overall', publicKeys)
  check('and no count, depth, latency or remainder anywhere in it', !/\d/.test(JSON.stringify(low.components)) && low.components.every((c) => Object.keys(c).sort().join(',') === 'name,note,state'), JSON.stringify(low.components))
  const full = await computeOperatorStatus(new Date(), { sponsorRead: async () => new Decimal(1) })
  check('the operator view carries the numbers: queues, passes with remaining, sponsors, stranded', full.queues.length > 0 && full.passes.some((p) => 'remaining' in p) && full.sponsors.some((s) => s.low) && full.stranded !== null, JSON.stringify({ q: full.queues.length, s: full.sponsors }))
  const first = await statusSnapshot(new Date())
  const second = await statusSnapshot(new Date(Date.now() + 1000))
  const third = await statusSnapshot(new Date(Date.now() + 20_000))
  check('the snapshot is cached within the TTL and recomputed after it', first === second && third !== first)
  const op = await operatorStatus(new Date(Date.now() + 20_000))
  check('the operator view shares the cache and the public view is its projection', op.generatedAt === third.generatedAt && !('queues' in third))
}

/* ── 6. fail closed is visible: Redis gone ─────────────────────────────── */

async function limiterWithoutRedis(): Promise<void> {
  console.log('\n6. The limiter failing closed on a Redis outage is counted as such')
  await redis.quit()
  const result = await rateLimit('login:203.0.113.9', 5, 60)
  check('the limiter denies', result.allowed === false)
  const unavailable = withAttrs(await points(METRIC.rateLimitRejections), { route: 'login', reason: 'unavailable' })
  check('and counts the denial as "unavailable" on the route, distinct from a real limit', valueOf(unavailable[0]) === 1, JSON.stringify(unavailable.map((d) => d.attributes)))
}

async function main(): Promise<void> {
  try {
    await claimTrace()
    await workerTrace()
    await forcedConditions()
    await plantedAttributes()
    await statusPage()
    await limiterWithoutRedis()
  } finally {
    await stopTelemetry().catch(() => undefined)
    await prisma.$disconnect()
    for (const q of [batchConfirmQueue(), expiryJobs()]) await q.close().catch(() => undefined)
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
