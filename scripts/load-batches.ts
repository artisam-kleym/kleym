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

  if (batches !== expected || seen.size !== LINKS || after !== batches) process.exit(1)
}

void main()
