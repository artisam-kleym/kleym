/**
 * Verification for #41: the campaign detail page is bounded at
 * `MAX_LINKS_PER_CAMPAIGN`, its counts match the table, and the full link
 * table pages and filters in the same order. Real Postgres.
 *
 * This is the regression guard the issue asks for: an unbounded read shipped
 * twice and reading the code caught it neither time. Run: pnpm verify:campaign-detail
 */
import { randomUUID } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { env } = await import('../src/lib/config/env')
const { LINK_PREVIEW, loadCampaignDetail, loadCampaignHeader, linksPage, linksQuerySchema, statusCounts } =
  await import('../src/lib/api/campaign-detail')

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const STATUSES = ['PENDING', 'ACTIVE', 'CLAIMED', 'EXPIRED', 'RECLAIMED', 'FAILED'] as const

async function fixture(links: number) {
  const user = await prisma.user.create({
    data: { username: `detail-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' },
    select: { id: true },
  })
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id, name: 'verify-detail', network: 'testnet',
      senderPublicKey: Keypair.random().publicKey(), assetCode: 'XLM',
      amountPerLink: '1.0000000', linkCount: links,
      expiresAt: new Date(Date.now() + 86_400_000), status: 'ACTIVE',
    },
    select: { id: true },
  })
  // A spread of statuses, in the chunks the wizard posts.
  const CHUNK = 500
  for (let offset = 0; offset < links; offset += CHUNK) {
    const size = Math.min(CHUNK, links - offset)
    await prisma.claimLink.createMany({
      data: Array.from({ length: size }, (_, i) => ({
        campaignId: campaign.id,
        ephemeralPublicKey: Keypair.random().publicKey(),
        status: STATUSES[(offset + i) % STATUSES.length]!,
        label: `link ${offset + i}`,
      })),
    })
  }
  return { userId: user.id, campaignId: campaign.id }
}

async function theDetailPageIsBounded(): Promise<void> {
  const size = env.MAX_LINKS_PER_CAMPAIGN
  console.log(`\n1. The detail page at MAX_LINKS_PER_CAMPAIGN (${size} links)`)
  const f = await fixture(size)

  const started = process.hrtime.bigint()
  const loaded = await loadCampaignDetail(f.campaignId, f.userId)
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  if (!loaded) return check('it loads', false)

  check(`the link preview is at most ${LINK_PREVIEW} rows`, loaded.campaign.links.length <= LINK_PREVIEW, `${loaded.campaign.links.length}`)
  check('and is exactly the preview size here', loaded.campaign.links.length === LINK_PREVIEW, `${loaded.campaign.links.length}`)
  check(`it loads in well under a second (${ms.toFixed(0)} ms)`, ms < 1_000)

  // Criterion 2: counts match the full table, computed the slow way here.
  const all = await prisma.claimLink.findMany({ where: { campaignId: f.campaignId }, select: { status: true } })
  const slow = Object.fromEntries(STATUSES.map((s) => [s, all.filter((l) => l.status === s).length]))
  check('the status counts match the full table', JSON.stringify(loaded.counts) === JSON.stringify(slow), `${JSON.stringify(loaded.counts)} vs ${JSON.stringify(slow)}`)
  check('and sum to the campaign size', Object.values(loaded.counts).reduce((a, b) => a + b, 0) === size)

  // Criterion 4: the preview is the first page of the table, same order.
  const first = await linksPage(f.campaignId, linksQuerySchema.parse({ perPage: String(LINK_PREVIEW) }))
  check('the preview is the first page of the full table, in the same order',
    JSON.stringify(first.links.map((l) => l.id)) === JSON.stringify(loaded.campaign.links.map((l) => l.id)))

  // Criterion 3: paging and filtering.
  const page = await linksPage(f.campaignId, linksQuerySchema.parse({ status: 'CLAIMED', perPage: '100', page: '2' }))
  check('a filtered page is bounded', page.links.length <= 100 && page.links.every((l) => l.status === 'CLAIMED'), `${page.links.length}`)
  check('and its total is the filtered count', page.total === loaded.counts.CLAIMED, `${page.total} vs ${loaded.counts.CLAIMED}`)
  check('rows carry label, status, claimant and hash fields',
    page.links.every((l) => 'label' in l && 'status' in l && 'claimedBy' in l && 'claimTxHash' in l))

  const walked = new Set<string>()
  for (let p = 1; p <= Math.ceil(size / 100); p += 1) {
    for (const l of (await linksPage(f.campaignId, linksQuerySchema.parse({ perPage: '100', page: String(p) }))).links) walked.add(l.id)
  }
  check(`walking every page returns each link once (${walked.size})`, walked.size === size)

  // Cleanup: 10,000 rows is a lot to leave behind for the next script.
  await prisma.campaign.delete({ where: { id: f.campaignId } })
}

async function ownershipHolds(): Promise<void> {
  console.log('\n2. Another user cannot load the page or the table')
  const f = await fixture(3)
  const other = await prisma.user.create({
    data: { username: `detail-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' },
    select: { id: true },
  })
  check('the detail loader answers null', (await loadCampaignDetail(f.campaignId, other.id)) === null)
  check('the links header answers null', (await loadCampaignHeader(f.campaignId, other.id)) === null)
  check('the owner still sees it', (await loadCampaignDetail(f.campaignId, f.userId)) !== null)
  check('counts on an empty status are zero, not missing',
    Object.keys(await statusCounts(f.campaignId)).length === STATUSES.length)
}

async function main(): Promise<void> {
  try {
    await theDetailPageIsBounded()
    await ownershipHolds()
  } finally {
    await prisma.$disconnect()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
