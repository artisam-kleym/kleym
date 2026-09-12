/**
 * Load test for the batch path. SPEC.md §11.10, issue #17.
 *
 * The question is narrow and worth answering by measurement rather than
 * assertion: is `MAX_LINKS_PER_CAMPAIGN` a ceiling this system survives, or an
 * aspirational number nobody has driven it to? A 10,000-link campaign is 112
 * batches at 90 operations each.
 *
 * What is measured here is everything up to Horizon: link registration,
 * batch planning under a serializable transaction, and the paged reads the
 * wizard and CSV export perform. Submission itself is NOT measured — that
 * would spend real testnet sequence numbers for 112 transactions and tells you
 * about Horizon's throughput rather than Kleym's.
 *
 * Then the part that IS the bottleneck at this size: the maintenance jobs.
 * `reconcileAll` (every 5 minutes) and `watchEphemerals` (every 15) each do
 * one serial Horizon read per live link. The ledger reads are stubbed at a
 * nominal latency, so what is measured is Kleym's side of a pass — the
 * candidate set, the passes it takes to cover it, the wall-clock per pass
 * with the stub — and then the arithmetic that matters: whether one pass at a
 * realistic Horizon latency fits inside its own schedule interval. Review on
 * #38 asked for exactly this number; the batch path was never the ceiling.
 *
 * Run: pnpm loadtest
 */
import { randomUUID } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { env } = await import('../src/lib/config/env')
const { ensurePlanned } = await import('../src/lib/api/batches')
const { LINK_ORDER } = await import('../src/lib/api/link-order')
const { reconcileAll, RECONCILE_PASS_LIMIT } = await import('../src/lib/api/reconcile')
const { watchEphemerals, WATCH_PASS_LIMIT } = await import('../src/lib/api/stranded')
const { memoryPassCursor } = await import('../src/lib/queue/pass-cursor')

/** What one Horizon read costs from Railway to horizon.stellar.org, roughly. */
const HORIZON_LATENCY_MS = Number(process.env.HORIZON_LATENCY_MS ?? 150)
const RECONCILE_INTERVAL_MS = 5 * 60_000
const WATCH_INTERVAL_MS = 15 * 60_000

const LINKS = Number(process.env.LOAD_LINKS ?? env.MAX_LINKS_PER_CAMPAIGN)

const ms = (start: bigint) => Number(process.hrtime.bigint() - start) / 1e6
const fmt = (n: number) => `${n.toFixed(0)} ms`

async function main(): Promise<void> {
  console.log(`Batch path under load — ${LINKS} links\n${'='.repeat(60)}`)

  const user = await prisma.user.create({
    data: { username: `load-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' },
    select: { id: true },
  })
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id, name: 'load test', network: 'testnet',
      senderPublicKey: Keypair.random().publicKey(), assetCode: 'XLM',
      amountPerLink: '1.0000000', linkCount: LINKS,
      expiresAt: new Date(Date.now() + 30 * 86_400_000), status: 'DRAFT',
    },
    select: { id: true },
  })

  // 1. Registration, in the chunks the wizard actually posts.
  let start = process.hrtime.bigint()
  const CHUNK = 500
  for (let offset = 0; offset < LINKS; offset += CHUNK) {
    const size = Math.min(CHUNK, LINKS - offset)
    await prisma.claimLink.createMany({
      data: Array.from({ length: size }, () => ({
        campaignId: campaign.id,
        ephemeralPublicKey: Keypair.random().publicKey(),
        status: 'PENDING' as const,
      })),
    })
  }
  const registration = ms(start)
  console.log(`registration      ${fmt(registration)}  (${(LINKS / (registration / 1000)).toFixed(0)} links/s)`)

  // 2. Planning: one serializable transaction that assigns every link a batch.
  start = process.hrtime.bigint()
  await ensurePlanned(campaign.id)
  const planning = ms(start)
  const batches = await prisma.batch.count({ where: { campaignId: campaign.id } })
  console.log(`planning          ${fmt(planning)}  (${batches} batches)`)

  // 3. Planning again — the idempotent path a double-click takes.
  start = process.hrtime.bigint()
  await ensurePlanned(campaign.id)
  console.log(`re-planning       ${fmt(ms(start))}  (idempotent; must not renumber)`)

  const after = await prisma.batch.count({ where: { campaignId: campaign.id } })
  console.log(`                  ${after === batches ? 'batch count unchanged' : `CHANGED: ${batches} -> ${after}`}`)

  // 4. The paged walk the CSV export and the campaign page perform.
  start = process.hrtime.bigint()
  const seen = new Set<string>()
  const PAGE = 500
  for (let skip = 0; skip < LINKS; skip += PAGE) {
    const rows = await prisma.claimLink.findMany({
      where: { campaignId: campaign.id },
      orderBy: LINK_ORDER,
      skip,
      take: PAGE,
      select: { id: true },
    })
    for (const row of rows) seen.add(row.id)
  }
  const paging = ms(start)
  console.log(`paged walk        ${fmt(paging)}  (${seen.size} distinct of ${LINKS})`)

  // 5. Loading one batch's links, which is what prepare does per signature.
  const first = await prisma.batch.findFirstOrThrow({
    where: { campaignId: campaign.id },
    orderBy: { sequence: 'asc' },
    select: { id: true },
  })
  start = process.hrtime.bigint()
  const batchLinks = await prisma.claimLink.findMany({
    where: { batchId: first.id },
    orderBy: LINK_ORDER,
    select: { id: true, ephemeralPublicKey: true },
  })
  console.log(`one batch's links ${fmt(ms(start))}  (${batchLinks.length} links)`)

  // 6. The maintenance jobs over the same campaign, now with every link live.
  //    Reads are stubbed (a balance that is still there; no ephemeral account
  //    on the ledger) so nothing here touches Horizon, and the stub costs ~0.
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'ACTIVE' } })
  const ids = await prisma.claimLink.findMany({ where: { campaignId: campaign.id }, select: { id: true } })
  const BALANCE_CHUNK = 500
  for (let i = 0; i < ids.length; i += BALANCE_CHUNK) {
    await Promise.all(
      ids.slice(i, i + BALANCE_CHUNK).map((row, n) =>
        prisma.claimLink.update({
          where: { id: row.id },
          data: { status: 'ACTIVE', balanceId: `${(i + n).toString(16).padStart(8, '0')}${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`.slice(0, 72) },
        }),
      ),
    )
  }
  const candidates = await prisma.claimLink.count({ where: { campaignId: campaign.id, balanceId: { not: null } } })

  console.log(`\nMaintenance jobs — ${candidates} live links\n${'='.repeat(60)}`)
  console.log(`(ledger reads stubbed; projections assume ${HORIZON_LATENCY_MS} ms per Horizon read)`)

  const stillThere = async (balanceId: string) => ({ id: balanceId, asset: 'native', amount: '1.0000000', claimants: [] })
  const jobs = [
    {
      name: 'reconcile',
      limit: RECONCILE_PASS_LIMIT,
      interval: RECONCILE_INTERVAL_MS,
      run: (cursor: ReturnType<typeof memoryPassCursor>) =>
        reconcileAll({ loadBalance: stillThere, readDisposal: async () => null }, { cursor }),
    },
    {
      name: 'ephemeral-watch',
      limit: WATCH_PASS_LIMIT,
      interval: WATCH_INTERVAL_MS,
      run: (cursor: ReturnType<typeof memoryPassCursor>) =>
        watchEphemerals(
          {
            readAccount: async () => null,
            balanceExists: async () => true,
            reserve: async () => new (await import('decimal.js')).default('0.5'),
            askReconcile: async () => undefined,
          },
          new Date(),
          { cursor },
        ),
    },
  ]

  let maintenanceOk = true
  for (const job of jobs) {
    const cursor = memoryPassCursor()
    // The whole table is the candidate set — the load campaign plus whatever
    // else is live — so the pass count is measured, not assumed.
    let passes = 0
    let checked = 0
    let slowestPass = 0
    let remaining = -1
    const walkStart = process.hrtime.bigint()
    do {
      const passStart = process.hrtime.bigint()
      const report = await job.run(cursor)
      const took = ms(passStart)
      passes += 1
      checked += 'linksChecked' in report ? report.linksChecked : report.checked
      remaining = report.remaining
      slowestPass = Math.max(slowestPass, took)
    } while (remaining > 0 && passes < 1_000)
    const walk = ms(walkStart)

    const projectedPass = job.limit * HORIZON_LATENCY_MS + slowestPass
    const fits = projectedPass < job.interval
    const fullCoverage = passes * job.interval
    if (!fits || checked < candidates) maintenanceOk = false

    console.log(`\n${job.name}`)
    console.log(`  limit per pass    ${job.limit}`)
    console.log(`  passes to cover   ${passes}  (${checked} links, ${fmt(walk)} with the stub)`)
    console.log(`  slowest pass      ${fmt(slowestPass)}  (Kleym's side only)`)
    console.log(`  projected pass    ${fmt(projectedPass)} at ${HORIZON_LATENCY_MS} ms/read — ${fits ? 'fits' : 'DOES NOT FIT'} in the ${job.interval / 60_000}-minute interval`)
    console.log(`  full coverage     every ${(fullCoverage / 60_000).toFixed(0)} min at this size`)
  }

  console.log('\n' + '='.repeat(60))
  const expected = Math.ceil(LINKS / env.MAX_OPS_PER_BATCH)
  console.log(`${batches} batches for ${LINKS} links at ${env.MAX_OPS_PER_BATCH}/batch (expected ${expected})`)
  console.log(
    seen.size === LINKS
      ? 'The paged walk returned every link exactly once.'
      : `PAGED WALK LOST ROWS: ${seen.size} of ${LINKS}`,
  )

  await prisma.campaign.delete({ where: { id: campaign.id } })
  await prisma.user.delete({ where: { id: user.id } })
  await prisma.$disconnect()

  console.log(
    maintenanceOk
      ? 'Both maintenance passes fit their schedule interval at this size.'
      : 'A MAINTENANCE PASS DOES NOT FIT ITS INTERVAL, or did not cover every link.',
  )

  if (batches !== expected || seen.size !== LINKS || after !== batches || !maintenanceOk) process.exit(1)
}

void main()
