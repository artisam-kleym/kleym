/**
 * Verification for /campaigns and /history on #40. Real Postgres.
 *
 * Criteria 1–4: ownership in the query, search and filter surviving paging,
 * stable ordering over equal timestamps, and history rows carrying what the
 * page renders. Run: pnpm verify:campaign-list
 */
import { randomUUID } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { listCampaigns, claimHistory, campaignNames, campaignListQuerySchema, historyQuerySchema } = await import(
  '../src/lib/api/campaign-list'
)

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Returns the user's personal ORGANISATION id — the scope the list reads in. */
async function user(): Promise<string> {
  const row = await prisma.user.create({
    data: { username: `list-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' },
    select: { id: true },
  })
  return personalOrg(prisma, row.id)
}
const userOf = (organizationId: string) => organizationId.replace(/^org_/, '')

/**
 * Several campaigns with ONE createdAt. Prisma fills `@default(now())` on the
 * client per statement, so the stamp is set explicitly here to produce the
 * ties that a bulk import or a same-transaction write produces in practice.
 */
async function campaigns(organizationId: string, names: string[], status: 'ACTIVE' | 'EXPIRED' = 'ACTIVE') {
  const createdAt = new Date()
  return prisma.$transaction(
    names.map((name) =>
      prisma.campaign.create({
        data: {
          userId: userOf(organizationId), organizationId, name, network: 'testnet', senderPublicKey: Keypair.random().publicKey(),
          assetCode: 'XLM', amountPerLink: '1.0000000', linkCount: 1,
          expiresAt: new Date(Date.now() + 86_400_000), status, createdAt,
        },
        select: { id: true, name: true },
      }),
    ),
  )
}

const list = (userId: string, q: Record<string, string>) =>
  listCampaigns(userId, campaignListQuerySchema.parse(q))
const history = (userId: string, q: Record<string, string>) =>
  claimHistory(userId, historyQuerySchema.parse(q))

async function ownershipIsInTheQuery(): Promise<void> {
  console.log('\n1. Another user\'s campaign is not reachable, by listing or by id')
  const [alice, mallory] = [await user(), await user()]
  const [mine] = await campaigns(alice, ['Alice promo'])
  await campaigns(mallory, ['Mallory promo'])

  const seen = await list(mallory, {})
  check('the list holds only the caller\'s rows', seen.rows.every((r) => r.name === 'Mallory promo') && seen.total === 1, JSON.stringify(seen.rows.map((r) => r.name)))

  // Search cannot become an enumeration surface: a name that exists, under
  // another user, matches nothing.
  const probe = await list(mallory, { q: 'Alice' })
  check('searching another user\'s name finds nothing', probe.total === 0, `${probe.total}`)

  const byId = await history(mallory, { campaignId: mine!.id })
  check('naming another user\'s campaign id in history finds nothing', byId.total === 0, `${byId.total}`)
  const names = await campaignNames(mallory)
  check('the campaign filter lists only the caller\'s campaigns', names.every((c) => c.name === 'Mallory promo'))
}

async function filtersComposeAndSurvivePaging(): Promise<void> {
  console.log('\n2. Search and status compose, across pages')
  const u = await user()
  await campaigns(u, Array.from({ length: 7 }, (_, i) => `Summer ${i}`), 'ACTIVE')
  await campaigns(u, Array.from({ length: 4 }, (_, i) => `Summer old ${i}`), 'EXPIRED')
  await campaigns(u, ['Winter'], 'ACTIVE')

  const all = await list(u, { q: 'summer' })
  check('search is case-insensitive and matches 11', all.total === 11, `${all.total}`)
  const active = await list(u, { q: 'summer', status: 'ACTIVE', perPage: '3' })
  check('with a status filter, 7', active.total === 7, `${active.total}`)
  check('page 1 holds 3', active.rows.length === 3, `${active.rows.length}`)
  const page3 = await list(u, { q: 'summer', status: 'ACTIVE', perPage: '3', page: '3' })
  check('page 3 holds the last one, still filtered', page3.rows.length === 1 && page3.rows[0]!.status === 'ACTIVE' && /Summer/.test(page3.rows[0]!.name), JSON.stringify(page3.rows.map((r) => r.name)))
  const beyond = await list(u, { q: 'summer', status: 'ACTIVE', perPage: '3', page: '4' })
  check('page 4 is empty, not an error', beyond.rows.length === 0 && beyond.total === 7)
}

async function orderingIsStable(): Promise<void> {
  console.log('\n3. Campaigns sharing a createdAt page the same way every time')
  const u = await user()
  const created = await campaigns(u, Array.from({ length: 90 }, (_, i) => `Tie ${i}`))
  const stamps = await prisma.campaign.findMany({ where: { organizationId: u }, select: { createdAt: true } })
  check('they do share a createdAt', new Set(stamps.map((s) => s.createdAt.getTime())).size === 1)

  // Relocate tuples, which is what perturbs an unstable sort.
  for (const c of created.slice(0, 15)) {
    await prisma.campaign.update({ where: { id: c.id }, data: { name: `${c.name} renamed` } })
  }
  const walk = async () => {
    const ids: string[] = []
    for (let page = 1; page <= 9; page += 1) ids.push(...(await list(u, { perPage: '10', page: String(page) })).rows.map((r) => r.id))
    return ids
  }
  const first = await walk()
  for (const c of created.slice(15, 45)) {
    await prisma.campaign.update({ where: { id: c.id }, data: { name: `${c.name} again` } })
  }
  const second = await walk()
  check('90 distinct across nine pages', new Set(first).size === 90, `${new Set(first).size}`)
  check('the same order after rows moved', JSON.stringify(first) === JSON.stringify(second))
}

async function historyCarriesTheRecord(): Promise<void> {
  console.log('\n4. History shows claims and reclaims with what the page renders')
  const u = await user()
  const [c] = await campaigns(u, ['Claimed things'])
  const recipient = Keypair.random().publicKey()
  const mk = (status: 'CLAIMED' | 'RECLAIMED' | 'ACTIVE', at: Date | null, hash: string | null) =>
    prisma.claimLink.create({
      data: {
        campaignId: c!.id, ephemeralPublicKey: Keypair.random().publicKey(), amount: '1.0000000', status,
        claimedAt: at, claimedBy: at ? recipient : null, claimTxHash: hash,
      },
    })
  await mk('CLAIMED', new Date('2026-09-01T10:00:00Z'), 'a'.repeat(64))
  await mk('RECLAIMED', new Date('2026-09-05T10:00:00Z'), 'b'.repeat(64))
  await mk('ACTIVE', null, null)

  const rows = (await history(u, {})).rows
  check('two rows, the live link excluded', rows.length === 2, `${rows.length}`)
  check('newest first', rows[0]?.status === 'RECLAIMED' && rows[1]?.status === 'CLAIMED', JSON.stringify(rows.map((r) => r.status)))
  check('amount, asset, claimant and hash present', rows.every((r) => r.amount === '1' && r.assetCode === 'XLM' && r.claimedBy === recipient && r.claimTxHash?.length === 64))

  const ranged = (await history(u, { from: '2026-09-05', to: '2026-09-05' })).rows
  check('a one-day range includes that day', ranged.length === 1 && ranged[0]?.status === 'RECLAIMED', `${ranged.length}`)
  const before = (await history(u, { to: '2026-09-04' })).rows
  check('and excludes the day after', before.length === 1 && before[0]?.status === 'CLAIMED', `${before.length}`)
}

async function main(): Promise<void> {
  try {
    await ownershipIsInTheQuery()
    await filtersComposeAndSurvivePaging()
    await orderingIsStable()
    await historyCarriesTheRecord()
  } finally {
    await prisma.$disconnect()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
