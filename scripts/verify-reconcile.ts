/**
 * Verification for the reconciliation acceptance criteria on #12. Real Postgres.
 *
 * The ledger reads are INJECTED. That is the whole point rather than a
 * convenience: reconciliation's job is to disagree with the database, so a
 * check that passes whenever Horizon is unreachable proves nothing — which is
 * the false-pass #31's review caught in exactly this shape.
 *
 * Run: pnpm verify:reconcile
 */
import { randomUUID } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { readDisposal } = await import('../src/lib/api/reconcile')
const { reconcileJobs, requestReconcile } = await import('../src/lib/queue/maintenance')
const { memoryPassCursor } = await import('../src/lib/queue/pass-cursor')
const { reconcileCampaign, reconcileAll, sweepExpired, openFindings, findingsValue } = await import(
  '../src/lib/api/reconcile'
)

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

type LinkStatus = 'PENDING' | 'ACTIVE' | 'CLAIMED' | 'EXPIRED' | 'RECLAIMED' | 'FAILED'

interface Fixture {
  campaignId: string
  senderPublicKey: string
  links: { id: string; balanceId: string; key: string }[]
}

async function fixture(
  statuses: LinkStatus[],
  opts: { expiresAt?: Date; campaignStatus?: 'ACTIVE' | 'PARTIAL' | 'CREATING' | 'EXPIRED' } = {},
): Promise<Fixture> {
  const user = await prisma.user.create({
    data: { username: `recon-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' },
    select: { id: true },
  })
  const sender = Keypair.random().publicKey()
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      name: 'verify-reconcile',
      network: 'testnet',
      senderPublicKey: sender,
      assetCode: 'XLM',
      amountPerLink: '2.5000000',
      linkCount: statuses.length,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 30 * 86_400_000),
      status: opts.campaignStatus ?? 'ACTIVE',
    },
    select: { id: true },
  })

  const links = []
  for (const status of statuses) {
    const key = Keypair.random().publicKey()
    const balanceId = `00000000${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`.slice(0, 72)
    const row = await prisma.claimLink.create({
      data: { campaignId: campaign.id, ephemeralPublicKey: key, status, balanceId },
      select: { id: true },
    })
    links.push({ id: row.id, balanceId, key })
  }

  return { campaignId: campaign.id, senderPublicKey: sender, links }
}

/** A ledger that still holds every listed balance. */
const holding = (ids: string[]) => async (balanceId: string) =>
  ids.includes(balanceId)
    ? { id: balanceId, asset: 'native', amount: '2.5000000', claimants: [] }
    : null

const noDisposal = async () => null
const disposalBy = (claimant: string, hash = randomUUID().replace(/-/g, '')) => async () => ({
  claimant,
  transactionHash: hash,
})

async function correctsDriftTowardsTheChain(): Promise<void> {
  console.log('\n1. A link claimed on-chain but ACTIVE here is corrected')

  const f = await fixture(['ACTIVE'])
  const recipient = Keypair.random().publicKey()
  const hash = randomUUID().replace(/-/g, '')

  const report = await reconcileCampaign(f.campaignId, {
    loadBalance: holding([]), // gone from the ledger
    readDisposal: disposalBy(recipient, hash),
  })

  check('one correction reported', report.corrected === 1, JSON.stringify(report))

  const link = await prisma.claimLink.findUniqueOrThrow({
    where: { id: f.links[0]!.id },
    select: { status: true, claimedBy: true, claimTxHash: true },
  })
  check('the row is CLAIMED', link.status === 'CLAIMED', link.status)
  check('with the claimant the LEDGER named', link.claimedBy === recipient, `${link.claimedBy}`)
  check('and that transaction hash', link.claimTxHash === hash, `${link.claimTxHash}`)

  const findings = await openFindings()
  const mine = findings.filter((finding) => finding.link.id === f.links[0]!.id)
  check('the drift is reported', mine.length === 1 && mine[0]!.kind === 'claimed_on_chain', JSON.stringify(mine.map((m) => m.kind)))
}

async function tellsClaimFromReclaim(): Promise<void> {
  console.log('\n2. The sender taking it back is a reclaim, not a claim')

  const f = await fixture(['ACTIVE'])
  await reconcileCampaign(f.campaignId, {
    loadBalance: holding([]),
    // The campaign's OWN sender key — compared, not inferred from timing.
    readDisposal: disposalBy(f.senderPublicKey),
  })

  const link = await prisma.claimLink.findUniqueOrThrow({
    where: { id: f.links[0]!.id },
    select: { status: true, claimedBy: true },
  })
  check('the row is RECLAIMED', link.status === 'RECLAIMED', link.status)
  check('and records the sender', link.claimedBy === f.senderPublicKey)
}

async function refusesToCorrectTheCriticalCase(): Promise<void> {
  console.log('\n3. CLAIMED here but still on the ledger is reported and NOT corrected')

  const f = await fixture(['CLAIMED'])
  const before = await prisma.claimLink.findUniqueOrThrow({
    where: { id: f.links[0]!.id },
    select: { status: true },
  })

  const report = await reconcileCampaign(f.campaignId, {
    loadBalance: holding([f.links[0]!.balanceId]), // still there
    readDisposal: noDisposal,
  })

  check('one critical reported', report.critical === 1, JSON.stringify(report))
  check('nothing was corrected', report.corrected === 0, JSON.stringify(report))

  const after = await prisma.claimLink.findUniqueOrThrow({
    where: { id: f.links[0]!.id },
    select: { status: true },
  })
  check('the row is left exactly as it was', after.status === before.status, `${before.status} -> ${after.status}`)

  const findings = (await openFindings()).filter((finding) => finding.link.id === f.links[0]!.id)
  check('it is surfaced on the report', findings.length === 1, JSON.stringify(findings.map((x) => x.kind)))
  check('at error severity', findings[0]?.severity === 'error', `${findings[0]?.severity}`)
}

async function doesNotGuessMidFlight(): Promise<void> {
  console.log('\n4. A claim mid-flight is left alone rather than guessed at')

  const f = await fixture(['ACTIVE'])
  const report = await reconcileCampaign(f.campaignId, {
    // Gone from the ledger, but Horizon has not indexed the operation yet —
    // indistinguishable from "never claimed" for a few seconds.
    loadBalance: holding([]),
    readDisposal: noDisposal,
  })

  check('reported as unresolved', report.unresolved === 1, JSON.stringify(report))
  check('nothing was corrected', report.corrected === 0, JSON.stringify(report))

  const link = await prisma.claimLink.findUniqueOrThrow({
    where: { id: f.links[0]!.id },
    select: { status: true, claimedBy: true },
  })
  check('the row is still ACTIVE', link.status === 'ACTIVE', link.status)
  check('with no invented claimant', link.claimedBy === null, `${link.claimedBy}`)

  // And the next run, once indexed, settles it.
  const recipient = Keypair.random().publicKey()
  await reconcileCampaign(f.campaignId, { loadBalance: holding([]), readDisposal: disposalBy(recipient) })
  const settled = await prisma.claimLink.findUniqueOrThrow({
    where: { id: f.links[0]!.id },
    select: { status: true, claimedBy: true },
  })
  check('the next run settles it', settled.status === 'CLAIMED' && settled.claimedBy === recipient)

  const stillOpen = (await openFindings()).filter(
    (finding) => finding.link.id === f.links[0]!.id && finding.kind === 'unresolved',
  )
  check('and the unresolved finding is closed', stillOpen.length === 0, `${stillOpen.length} still open`)
}

async function isIdempotent(): Promise<void> {
  console.log('\n5. Running twice writes nothing extra and adds no noise')

  const f = await fixture(['ACTIVE', 'CLAIMED'])
  const deps = {
    loadBalance: holding([f.links[1]!.balanceId]), // link 1 gone, link 2 still there
    readDisposal: disposalBy(Keypair.random().publicKey()),
  }

  const first = await reconcileCampaign(f.campaignId, deps)
  const afterFirst = await prisma.claimLink.findMany({
    where: { campaignId: f.campaignId },
    orderBy: { id: 'asc' },
    select: { status: true, claimedBy: true, claimTxHash: true, updatedAt: true },
  })
  const findingsFirst = await prisma.reconciliationFinding.findMany({ where: { campaignId: f.campaignId } })

  const second = await reconcileCampaign(f.campaignId, deps)
  const afterSecond = await prisma.claimLink.findMany({
    where: { campaignId: f.campaignId },
    orderBy: { id: 'asc' },
    select: { status: true, claimedBy: true, claimTxHash: true, updatedAt: true },
  })
  const findingsSecond = await prisma.reconciliationFinding.findMany({ where: { campaignId: f.campaignId } })

  check('the second run corrects nothing new', second.corrected === 0, `${first.corrected} then ${second.corrected}`)
  check('the critical is still reported', second.critical === 1, JSON.stringify(second))
  check(
    'no row was written again',
    JSON.stringify(afterFirst.map((r) => r.updatedAt)) === JSON.stringify(afterSecond.map((r) => r.updatedAt)),
  )
  check(
    'no duplicate findings',
    findingsSecond.length === findingsFirst.length,
    `${findingsFirst.length} then ${findingsSecond.length}`,
  )
}

async function sweepsExpiry(): Promise<void> {
  console.log('\n6. The expiry sweep marks past-expiry links and campaigns EXPIRED')

  const past = await fixture(['ACTIVE', 'ACTIVE', 'CLAIMED', 'PENDING'], {
    expiresAt: new Date(Date.now() - 3_600_000),
  })
  const future = await fixture(['ACTIVE'])

  const report = await sweepExpired()
  check('links were expired', report.linksExpired >= 2, JSON.stringify(report))

  const rows = await prisma.claimLink.findMany({
    where: { campaignId: past.campaignId },
    select: { status: true },
  })
  const counts = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {})
  check('the two ACTIVE links are EXPIRED', counts.EXPIRED === 2, JSON.stringify(counts))
  // A CLAIMED link is settled and a PENDING one never had a balance; expiring
  // either would send the reclaim job (#13) after money that is not there.
  check('the CLAIMED link is untouched', counts.CLAIMED === 1, JSON.stringify(counts))
  check('the PENDING link is untouched', counts.PENDING === 1, JSON.stringify(counts))

  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: past.campaignId },
    select: { status: true },
  })
  check('the campaign is EXPIRED', campaign.status === 'EXPIRED', campaign.status)

  const unaffected = await prisma.campaign.findUniqueOrThrow({
    where: { id: future.campaignId },
    select: { status: true },
  })
  check('a future campaign is untouched', unaffected.status === 'ACTIVE', unaffected.status)

  const again = await sweepExpired()
  check('running it again expires nothing more', again.linksExpired === 0 && again.campaignsExpired === 0, JSON.stringify(again))
}

async function reportsValueExactly(): Promise<void> {
  console.log('\n7. The report totals value with Decimal, not floating point')

  const findings = [
    { campaign: { amountPerLink: '0.1' } },
    { campaign: { amountPerLink: '0.2' } },
  ]
  check('0.1 + 0.2 is 0.3', findingsValue(findings) === '0.3', findingsValue(findings))
  check('and the float answer is not', String(0.1 + 0.2) !== '0.3')
  check(
    'seven decimal places survive',
    findingsValue([{ campaign: { amountPerLink: '922337203685.4775807' } }]) === '922337203685.4775807',
  )
}

/**
 * One unreadable link does not take the run down with it.
 *
 * Reconciliation is what catches every other bug in the system, so the worst
 * failure mode is the one where a single bad row stops it running at all —
 * the alarm silenced by the thing it was meant to report. The first link here
 * fails hard; the second must still be reconciled.
 */
async function oneBadLinkDoesNotAbortTheRun(): Promise<void> {
  console.log('\n· a link that cannot be read, followed by one that can')
  const f = await fixture(['ACTIVE', 'ACTIVE'])
  const [poison, healthy] = f.links as [(typeof f.links)[number], (typeof f.links)[number]]
  const recipient = Keypair.random().publicKey()

  const report = await reconcileCampaign(f.campaignId, {
    loadBalance: async (balanceId: string) => {
      if (balanceId === poison.balanceId) throw new Error('Horizon is having a bad day')
      return null
    },
    readDisposal: disposalBy(recipient),
  })

  check('the run completed', typeof report.linksChecked === 'number', JSON.stringify(report))
  check('both links were visited', report.linksChecked === 2, JSON.stringify(report))
  check('the unreadable one is unresolved', report.unresolved === 1, JSON.stringify(report))

  const after = await prisma.claimLink.findUniqueOrThrow({
    where: { id: healthy.id },
    select: { status: true, claimedBy: true },
  })
  check('the healthy link was still corrected', after.status === 'CLAIMED', after.status)
  check('with the claimant the ledger named', after.claimedBy === recipient, `${after.claimedBy}`)

  const stuck = await prisma.claimLink.findUniqueOrThrow({
    where: { id: poison.id },
    select: { status: true },
  })
  check('and the unreadable one is left alone', stuck.status === 'ACTIVE', stuck.status)
}

/**
 * The live Horizon reader, against the real network.
 *
 * Every other check here injects a fake DisposalReader, so none of them touch
 * the code that actually talks to Horizon. That gap hid a real bug: a 404 —
 * which is what an ID Horizon has no operations for looks like — threw, and
 * because one link's failure aborted the loop, a single unreadable row stopped
 * reconciliation for every remaining campaign. This check runs the real reader
 * against an ID that cannot exist, so the gap cannot reopen silently.
 */
async function theLiveReaderSurvivesAnUnknownBalance(): Promise<void> {
  console.log('\n· the live Horizon reader, on an id that does not exist')
  const absent = `00000000${'ab'.repeat(32)}`
  let threw: string | null = null
  let result: unknown = 'not run'
  try {
    result = await readDisposal(absent)
  } catch (error) {
    threw = error instanceof Error ? error.message : String(error)
  }
  check('it does not throw', threw === null, `threw ${threw}`)
  check('it reports no disposal', result === null, JSON.stringify(result))
}

/**
 * The manual trigger cannot be used to pile up sweeps.
 *
 * A run is one Horizon read per ACTIVE link, so it takes minutes. Twenty
 * impatient clicks must not become twenty full sweeps queued behind each other.
 */
async function theManualTriggerDeduplicates(): Promise<void> {
  console.log('\n· twenty clicks of "Resync now"')
  const queue = reconcileJobs()
  await queue.obliterate({ force: true })
  for (let i = 0; i < 20; i += 1) await requestReconcile()
  const waiting = await queue.getWaitingCount()
  const delayed = await queue.getDelayedCount()
  check('queue exactly one sweep', waiting + delayed === 1, `${waiting} waiting, ${delayed} delayed`)

  const scoped = randomUUID()
  await requestReconcile(scoped)
  await requestReconcile(scoped)
  const after = (await queue.getWaitingCount()) + (await queue.getDelayedCount())
  check('a different campaign is its own scope', after === 2, `${after} queued`)
  await queue.obliterate({ force: true })
  await queue.close()
}

/**
 * The drift report puts criticals FIRST across mixed severities.
 *
 * Review on #12 found `orderBy: { severity: 'desc' }` on a String column,
 * which sorted 'warn' above 'error' — every critical at the bottom, below
 * every routine drift row, with a comment saying the opposite. The earlier
 * check only looked at one link's own finding, so no ordering was exercised.
 * This one produces a warn BEFORE an error and reads the list as the page does.
 */
async function criticalsSortFirst(): Promise<void> {
  console.log('\n· a warn finding recorded before an error one still lists after it')

  // Corrected drift → warn. Recorded first, so `firstSeenAt` would put it first.
  const drift = await fixture(['ACTIVE'])
  await reconcileCampaign(drift.campaignId, {
    loadBalance: holding([]),
    readDisposal: disposalBy(Keypair.random().publicKey()),
  })
  // Settled row, balance still on the ledger → error.
  const critical = await fixture(['CLAIMED'])
  await reconcileCampaign(critical.campaignId, {
    loadBalance: holding([critical.links[0]!.balanceId]),
    readDisposal: noDisposal,
  })

  const mine = new Set([drift.campaignId, critical.campaignId])
  const listed = (await openFindings()).filter((finding) => mine.has(finding.campaign.id))
  check('both findings are open', listed.length === 2, JSON.stringify(listed.map((f) => f.severity)))
  check('the error is listed first', listed[0]?.severity === 'error', JSON.stringify(listed.map((f) => f.severity)))
  check('the warn after it', listed[1]?.severity === 'warn', JSON.stringify(listed.map((f) => f.severity)))

  const whole = await openFindings()
  const firstWarn = whole.findIndex((f) => f.severity === 'warn')
  const lastError = whole.map((f) => f.severity).lastIndexOf('error')
  check(
    'and across the whole report no error sits below a warn',
    firstWarn === -1 || lastError === -1 || lastError < firstWarn,
    `last error at ${lastError}, first warn at ${firstWarn}`,
  )
}

/**
 * A scheduled pass is bounded, reports what it did not reach, and the next
 * pass continues from there rather than re-reading the same links.
 *
 * With one serial Horizon read per link and a five-minute schedule, an
 * unbounded pass over 10,000 links never finishes inside its interval and
 * nothing says so. The cursor is injected (in memory) so this does not depend
 * on Redis state left by a previous run.
 */
async function aPassIsBoundedAndResumes(): Promise<void> {
  console.log('\n· a pass of limit 2 over a set the limit does not cover')

  // Every other live link in the database is a candidate too, so this check
  // reads visits by which of ITS links got corrected, not by the totals.
  const f = await fixture(['ACTIVE', 'ACTIVE', 'ACTIVE'])
  const mine = new Set(f.links.map((l) => l.balanceId))
  const visited = new Set<string>()
  const deps = {
    loadBalance: async (balanceId: string) => {
      if (mine.has(balanceId)) visited.add(balanceId)
      // Still on the ledger, so nothing is corrected and the rows stay ACTIVE
      // — the check is about coverage, not drift.
      return { id: balanceId, asset: 'native', amount: '2.5000000', claimants: [] }
    },
    readDisposal: noDisposal,
  }

  const cursor = memoryPassCursor()

  const candidates = await prisma.claimLink.count({
    where: { balanceId: { not: null }, campaign: { status: { in: ['ACTIVE', 'PARTIAL', 'EXPIRED'] } } },
  })
  const limit = 2
  const passes = Math.ceil(candidates / limit)

  const first = await reconcileAll(deps, { limit, cursor })
  check('the first pass stops at the limit', first.linksChecked === limit, JSON.stringify(first))
  check('and reports what it left', first.remaining === candidates - limit, `${first.remaining} of ${candidates - limit}`)
  check('the cursor moved', cursor.value !== null)

  let last = first
  for (let i = 1; i < passes; i += 1) last = await reconcileAll(deps, { limit, cursor })
  check('the final pass reports nothing remaining', last.remaining === 0, JSON.stringify(last))
  check('every one of these links was reached across the passes', visited.size === 3, `${visited.size} of 3`)
  check('the cursor is cleared at the end of the set', cursor.value === null, `${cursor.value}`)

  visited.clear()
  await reconcileAll(deps, { limit, cursor })
  check('the next pass starts again from the top', visited.size <= limit)
}

async function main(): Promise<void> {
  try {
    await correctsDriftTowardsTheChain()
    await tellsClaimFromReclaim()
    await refusesToCorrectTheCriticalCase()
    await doesNotGuessMidFlight()
    await isIdempotent()
    await sweepsExpiry()
    await reportsValueExactly()
    await oneBadLinkDoesNotAbortTheRun()
    await criticalsSortFirst()
    await aPassIsBoundedAndResumes()
    await theLiveReaderSurvivesAnUnknownBalance()
    await theManualTriggerDeduplicates()
  } finally {
    await prisma.$disconnect()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
