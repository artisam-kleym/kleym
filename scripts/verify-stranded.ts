/**
 * Verification for the stranded-account monitor on #19. Real Postgres.
 *
 * Every ledger read is INJECTED. A monitor whose whole job is to describe what
 * is on the ledger cannot be checked against a stub of itself, and a check that
 * passes when Horizon is unreachable would report a healthy float while the
 * real one drained — the exact false pass this codebase was bitten by in #31.
 *
 * Run: pnpm verify:stranded
 */
import { randomUUID } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { watchEphemerals, strandedSummary, lockedReserve, STRAND_AFTER_MS } = await import(
  '../src/lib/api/stranded'
)
const { memoryPassCursor } = await import('../src/lib/queue/pass-cursor')
const { lastPassReports } = await import('../src/lib/queue/pass-report')

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const BASE = new Decimal('0.5')
const LONG_AGO = new Date(Date.now() - 4 * STRAND_AFTER_MS)
const JUST_NOW = new Date()

interface Fixture {
  campaignId: string
  links: { id: string; key: string; balanceId: string }[]
}

async function fixture(count: number, status: 'ACTIVE' | 'EXPIRED' | 'CLAIMED' = 'ACTIVE'): Promise<Fixture> {
  const user = await prisma.user.create({
    data: { username: `strand-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' },
    select: { id: true },
  })
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id, organizationId: await personalOrg(prisma, user.id), name: 'verify-stranded', network: 'testnet',
      senderPublicKey: Keypair.random().publicKey(), assetCode: 'XLM',
      amountPerLink: '2.5000000', linkCount: count,
      expiresAt: new Date(Date.now() + 30 * 86_400_000), status: 'ACTIVE',
    },
    select: { id: true },
  })

  const links = []
  for (let i = 0; i < count; i += 1) {
    const key = Keypair.random().publicKey()
    const balanceId = `00000000${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`.slice(0, 72)
    const row = await prisma.claimLink.create({
      data: { campaignId: campaign.id, ephemeralPublicKey: key, amount: '2.5000000', status, balanceId },
      select: { id: true },
    })
    links.push({ id: row.id, key, balanceId })
  }
  return { campaignId: campaign.id, links }
}

/** A ledger where the named accounts exist, with the given shape. */
function ledger(accounts: Record<string, { subentries?: number; holds?: { asset: string; balance: string }[]; when?: Date }>) {
  const asked: string[] = []
  return {
    asked,
    readAccount: async (publicKey: string) => {
      asked.push(publicKey)
      const found = accounts[publicKey]
      if (!found) return null
      return {
        subentryCount: found.subentries ?? 0,
        nonZeroAssets: found.holds ?? [],
        lastActivity: found.when ?? LONG_AGO,
      }
    },
  }
}

function deps(
  accounts: Parameters<typeof ledger>[0],
  liveBalances: string[],
) {
  const reconciled: string[] = []
  const l = ledger(accounts)
  return {
    readAccount: l.readAccount,
    balanceExists: async (balanceId: string) => liveBalances.includes(balanceId),
    reserve: async () => BASE,
    askReconcile: async (campaignId: string) => void reconciled.push(campaignId),
    reconciled,
    asked: l.asked,
  }
}

async function reportsAnAbandonedTx1(): Promise<void> {
  console.log('\n1. TX1 landed, TX2 never followed')
  const f = await fixture(1)
  const link = f.links[0]!
  const d = deps({ [link.key]: { subentries: 0 } }, [link.balanceId])

  const report = await watchEphemerals(d)
  check('it is reported as stranded', report.stranded === 1, JSON.stringify(report))
  check('and not as critical', report.critical === 0, JSON.stringify(report))

  const row = await prisma.strandedAccount.findUniqueOrThrow({
    where: { linkId: link.id },
    select: { lockedReserve: true, critical: true, detail: true, ephemeralPublicKey: true },
  })
  check('the locked reserve is (2 + subentries) × base', row.lockedReserve.toString() === '1', row.lockedReserve.toString())
  check('recorded against the ephemeral account', row.ephemeralPublicKey === link.key)
  check(
    'and the detail says Kleym cannot recover it',
    /cannot recover it/.test(row.detail),
    row.detail,
  )
  check('the report totals it', report.lockedXlm === '1', report.lockedXlm)
}

async function countsATrustline(): Promise<void> {
  console.log('\n2. A stranded account carrying a trustline')
  const f = await fixture(1)
  const link = f.links[0]!
  const d = deps({ [link.key]: { subentries: 1 } }, [link.balanceId])

  await watchEphemerals(d)
  const row = await prisma.strandedAccount.findUniqueOrThrow({
    where: { linkId: link.id },
    select: { lockedReserve: true },
  })
  // 1.0 for the account, 0.5 for the trustline — SPEC.md §3.3.2's figure.
  check('it locks 1.5, not 1.0', row.lockedReserve.toString() === '1.5', row.lockedReserve.toString())
  check('which is what lockedReserve computes', lockedReserve(BASE, 1).toString() === '1.5')
}

async function doesNotReportASucceededClaim(): Promise<void> {
  console.log('\n3. A claim that actually succeeded')
  const f = await fixture(1)
  const link = f.links[0]!
  // The account exists, but the balance is GONE: the claim worked and the row
  // is stale. Reporting a strand here would be a lie about Kleym's float.
  const d = deps({ [link.key]: { subentries: 0 } }, [])

  const report = await watchEphemerals(d)
  check('it is not reported as stranded', report.stranded === 0, JSON.stringify(report))
  check('it is handed to reconciliation', report.handedOff === 1, JSON.stringify(report))
  check('naming the campaign', d.reconciled.includes(f.campaignId), JSON.stringify(d.reconciled))

  const row = await prisma.strandedAccount.findUnique({ where: { linkId: link.id } })
  check('and nothing is recorded against it', row === null)
}

async function flagsAPartialClaim(): Promise<void> {
  console.log('\n4. An ephemeral account holding a balance')
  const f = await fixture(1)
  const link = f.links[0]!
  const d = deps(
    { [link.key]: { subentries: 1, holds: [{ asset: 'USDC', balance: '25.0000000' }] } },
    [link.balanceId],
  )

  const report = await watchEphemerals(d)
  check('it is critical', report.critical === 1, JSON.stringify(report))
  check('and still counted as stranded', report.stranded === 1, JSON.stringify(report))

  const row = await prisma.strandedAccount.findUniqueOrThrow({
    where: { linkId: link.id },
    select: { critical: true, detail: true },
  })
  check('the row is marked critical', row.critical === true)
  check('the detail names what it holds', /25\.0000000 USDC/.test(row.detail), row.detail)
  check('and says it needs a person', /needs a person/.test(row.detail), row.detail)
}

async function waitsBeforeCallingItAbandoned(): Promise<void> {
  console.log('\n5. A claim that is merely in progress')
  const f = await fixture(1)
  const link = f.links[0]!
  // TX1 landed seconds ago. The recipient is in their wallet, not gone.
  const d = deps({ [link.key]: { subentries: 0, when: JUST_NOW } }, [link.balanceId])

  const report = await watchEphemerals(d)
  check('it is not reported', report.stranded === 0, JSON.stringify(report))
  const row = await prisma.strandedAccount.findUnique({ where: { linkId: link.id } })
  check('and nothing is recorded', row === null)
}

async function clearsWhenTheClaimCompletes(): Promise<void> {
  console.log('\n6. A stranded claim that is finally completed')
  const f = await fixture(1)
  const link = f.links[0]!

  const stranded = deps({ [link.key]: { subentries: 0 } }, [link.balanceId])
  await watchEphemerals(stranded)
  const before = await prisma.strandedAccount.findUnique({ where: { linkId: link.id } })
  check('it starts out reported', before !== null)

  // The recipient came back. TX2 merged the ephemeral account away.
  const settled = deps({}, [])
  const report = await watchEphemerals(settled)
  check('the next run clears it', report.resolved >= 1, JSON.stringify(report))

  const after = await prisma.strandedAccount.findUnique({ where: { linkId: link.id } })
  check('with no manual action', after === null)

  const summary = await strandedSummary()
  check('and it is off the report', !summary.accounts.some((a) => a.linkId === link.id))
}

/**
 * The ordinary resolution: the recipient comes back and the claim completes.
 *
 * The sweep only visits ACTIVE and EXPIRED links, so a row whose link has
 * since reached CLAIMED is never revisited by the loop. Without an explicit
 * clear it stays on the admin report forever, reporting float as locked that
 * has already returned to the sponsor. This is acceptance criterion 5, and it
 * was a real bug until a worker run against real data surfaced it.
 */
async function clearsWhenTheLinkIsClaimed(): Promise<void> {
  console.log('\n7. A stranded link that later reaches CLAIMED')
  const f = await fixture(1)
  const link = f.links[0]!
  const d = deps({ [link.key]: { subentries: 0 } }, [link.balanceId])

  await watchEphemerals(d)
  check(
    'it starts out reported',
    (await prisma.strandedAccount.findUnique({ where: { linkId: link.id } })) !== null,
  )

  // TX2 landed. The claim completed and the reserve went back to the sponsor.
  await prisma.claimLink.update({ where: { id: link.id }, data: { status: 'CLAIMED' } })

  const report = await watchEphemerals(d)
  check('the next run clears it', report.resolved >= 1, JSON.stringify(report))
  check(
    'with no manual action',
    (await prisma.strandedAccount.findUnique({ where: { linkId: link.id } })) === null,
  )

  const summary = await strandedSummary()
  check(
    'and its reserve is no longer counted as locked',
    !summary.accounts.some((a) => a.linkId === link.id),
  )
}

async function isIdempotent(): Promise<void> {
  console.log('\n8. Running it twice')
  const f = await fixture(2)
  const accounts = Object.fromEntries(f.links.map((l) => [l.key, { subentries: 0 }]))
  const live = f.links.map((l) => l.balanceId)

  const first = await watchEphemerals(deps(accounts, live))
  const second = await watchEphemerals(deps(accounts, live))

  check('the same count both times', first.stranded === second.stranded, `${first.stranded} then ${second.stranded}`)
  check('and the same locked total', first.lockedXlm === second.lockedXlm, `${first.lockedXlm} / ${second.lockedXlm}`)

  const rows = await prisma.strandedAccount.count({ where: { campaignId: f.campaignId } })
  check('two rows, not four', rows === 2, `${rows}`)
}

async function ignoresFinishedLinks(): Promise<void> {
  console.log('\n9. Links with nothing outstanding')
  const claimed = await fixture(2, 'CLAIMED')
  const d = deps(Object.fromEntries(claimed.links.map((l) => [l.key, { subentries: 0 }])), claimed.links.map((l) => l.balanceId))

  await watchEphemerals(d)
  const asked = claimed.links.filter((l) => d.asked.includes(l.key))
  check('a CLAIMED link is never looked up', asked.length === 0, `${asked.length} looked up`)

  const rows = await prisma.strandedAccount.count({ where: { campaignId: claimed.campaignId } })
  check('and nothing is reported for it', rows === 0, `${rows}`)
}

async function totalsMatchTheRows(): Promise<void> {
  console.log('\n10. The admin total is the sum of the rows')
  const summary = await strandedSummary()
  const summed = summary.accounts.reduce((sum, a) => sum.plus(a.lockedReserve), new Decimal(0))

  check('count matches', summary.count === summary.accounts.length, `${summary.count}`)
  check(
    'total locked XLM is the exact sum',
    new Decimal(summary.lockedXlm).equals(summed),
    `${summary.lockedXlm} vs ${summed.toString()}`,
  )
  check(
    'the critical count matches the flagged rows',
    summary.critical === summary.accounts.filter((a) => a.critical).length,
    `${summary.critical}`,
  )
  check(
    'and critical rows sort first',
    summary.accounts.slice(0, summary.critical).every((a) => a.critical),
  )
}

/**
 * A scheduled pass is bounded, says what it did not reach, and the next pass
 * carries on from there. Same shape as reconcile's — one serial Horizon read
 * per link on a fixed schedule cannot cover 10,000 links inside its interval,
 * and an unbounded pass that never finishes reports nothing about it.
 */
async function aPassIsBoundedAndResumes(): Promise<void> {
  console.log('\n· a pass of limit 2 over a candidate set the limit does not cover')
  const f = await fixture(3)
  const mine = new Set(f.links.map((l) => l.key))
  const d = deps({}, f.links.map((l) => l.balanceId)) // no accounts on the ledger: nothing stranded
  const cursor = memoryPassCursor()
  const limit = 2

  const candidates = await prisma.claimLink.count({
    where: { status: { in: ['ACTIVE', 'EXPIRED'] }, balanceId: { not: null } },
  })
  const passes = Math.ceil(candidates / limit)

  const first = await watchEphemerals(d, JUST_NOW, { limit, cursor })
  check('the first pass stops at the limit', first.checked === limit, JSON.stringify(first))
  check('and reports what it left', first.remaining === candidates - limit, `${first.remaining} of ${candidates - limit}`)
  const recorded = (await lastPassReports())['ephemeral-watch']
  check('the shortfall is recorded for the admin page', recorded?.remaining === first.remaining && recorded.checked === limit, JSON.stringify(recorded))
  check('the cursor moved', cursor.value !== null)

  let last = first
  for (let i = 1; i < passes; i += 1) last = await watchEphemerals(d, JUST_NOW, { limit, cursor })
  check('the final pass reports nothing remaining', last.remaining === 0, JSON.stringify(last))
  const reached = d.asked.filter((key) => mine.has(key))
  check('every one of these links was read across the passes', new Set(reached).size === 3, `${new Set(reached).size} of 3`)
  check('the cursor is cleared at the end of the set', cursor.value === null, `${cursor.value}`)
}

async function main(): Promise<void> {
  try {
    await reportsAnAbandonedTx1()
    await countsATrustline()
    await doesNotReportASucceededClaim()
    await flagsAPartialClaim()
    await waitsBeforeCallingItAbandoned()
    await clearsWhenTheClaimCompletes()
    await clearsWhenTheLinkIsClaimed()
    await isIdempotent()
    await ignoresFinishedLinks()
    await totalsMatchTheRows()
    await aPassIsBoundedAndResumes()
  } finally {
    await prisma.$disconnect()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
