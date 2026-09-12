/**
 * Verification for the batch lifecycle acceptance criteria on #9. Real Postgres.
 *
 * These are state-machine guarantees that fail by returning 200 — a campaign
 * that reads ACTIVE while some of its links have no on-chain entry, or a link
 * carrying a balanceId for a batch that never confirmed. Nothing in typecheck,
 * lint or a unit test can see them, and the pure batching maths is already
 * covered in tests/lib/stellar/batch.test.ts.
 *
 * No Horizon. Submission is exercised only on the replay path, which by
 * design returns before touching the network.
 *
 * Run: pnpm verify:batches   (needs DATABASE_URL and a running Postgres)
 */
import { randomUUID } from 'node:crypto'
import { Account, Asset, Keypair, Networks, TransactionBuilder, type Transaction } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

// Before any import that touches config. DATABASE_URL is deliberately NOT
// defaulted over: this script only means anything against a real database.
applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { confirmBatch, ensurePlanned, markBatchFailed, retryFailedBatches, submitBatch } = await import(
  '../src/lib/api/batches'
)
const { buildBatchTransaction } = await import('../src/lib/stellar/batch')
const { registerLinks } = await import('../src/lib/api/links')
const { LINK_ORDER } = await import('../src/lib/api/link-order')

let failures = 0

function check(name: string, pass: boolean, detail = ''): void {
  if (pass) {
    console.log(`  PASS  ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const SIZE = Number(process.env.MAX_OPS_PER_BATCH ?? 90)
const EXPIRES = new Date(Date.now() + 30 * 86_400_000)

async function makeUser(): Promise<string> {
  const user = await prisma.user.create({
    data: { username: `verify-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' },
    select: { id: true },
  })
  await personalOrg(prisma, user.id)
  return user.id
}
const orgOf = (userId: string) => `org_${userId}`

async function makeCampaign(userId: string, linkCount: number, sender: Keypair) {
  const campaign = await prisma.campaign.create({
    data: {
      userId,
      organizationId: orgOf(userId),
      name: 'verify-batches',
      network: 'testnet',
      senderPublicKey: sender.publicKey(),
      assetCode: 'XLM',
      amountPerLink: '2.5000000',
      linkCount,
      expiresAt: EXPIRES,
      status: 'DRAFT',
    },
    select: { id: true },
  })

  /*
   * Registered through the REAL path, one createMany inside a transaction.
   *
   * An earlier version of this fixture inserted links one at a time, which
   * gave every link a distinct `createdAt` and quietly made the ordering
   * problem invisible to every check below. A fixture that is easier to reason
   * about than production is a fixture that tests something else.
   */
  const outcome = await registerLinks(
    campaign.id,
    orgOf(userId),
    Array.from({ length: linkCount }, () => Keypair.random().publicKey()),
  )
  if (outcome.kind !== 'ok') throw new Error(`fixture registration failed: ${outcome.kind}`)

  return campaign.id
}

async function batchesOf(campaignId: string) {
  return prisma.batch.findMany({
    where: { campaignId },
    orderBy: { sequence: 'asc' },
    select: { id: true, sequence: true, status: true, links: { select: { id: true, status: true, balanceId: true, ephemeralPublicKey: true }, orderBy: { createdAt: 'asc' } } },
  })
}

async function planningIsStable(): Promise<void> {
  console.log('\n1. Planning assigns every link exactly once, and only once')

  const user = await makeUser()
  const campaignId = await makeCampaign(user, 200, Keypair.random())

  await ensurePlanned(campaignId)
  const first = await batchesOf(campaignId)

  check('200 links produce exactly 3 batches', first.length === 3, `${first.length}`)
  check('batch sizes are 90 / 90 / 20', JSON.stringify(first.map((b) => b.links.length)) === '[90,90,20]', JSON.stringify(first.map((b) => b.links.length)))
  check('every link is assigned', first.reduce((n, b) => n + b.links.length, 0) === 200)

  // Called twice by a reload. Re-planning would renumber batches the sender
  // has already signed.
  await Promise.all([ensurePlanned(campaignId), ensurePlanned(campaignId)])
  const again = await batchesOf(campaignId)
  check('re-planning is a no-op', again.length === 3, `${again.length} batches after replan`)
  check('batch ids are unchanged', JSON.stringify(again.map((b) => b.id)) === JSON.stringify(first.map((b) => b.id)))

  /*
   * Three prepares racing from an UNPLANNED campaign — a double-click, or two
   * tabs. The serializable transaction aborts the losers, which is it working;
   * what must not happen is that abort reaching the sender as a 500.
   */
  const fresh = await makeCampaign(user, 5, Keypair.random())
  const raced = await Promise.allSettled([ensurePlanned(fresh), ensurePlanned(fresh), ensurePlanned(fresh)])
  const rejected = raced.filter((r) => r.status === 'rejected')
  check(
    'concurrent planning from scratch does not throw',
    rejected.length === 0,
    rejected.map((r) => String((r as PromiseRejectedResult).reason).slice(0, 60)).join(' | '),
  )
  check(
    'and still plans exactly one set of batches',
    (await prisma.batch.count({ where: { campaignId: fresh } })) === 1,
  )
}

async function partialFailureIsHonest(): Promise<void> {
  console.log('\n2. Batch 7 of 12 fails: 1–6 stay real, 7+ are FAILED, campaign is PARTIAL')

  const user = await makeUser()
  const campaignId = await makeCampaign(user, 12 * SIZE, Keypair.random())
  await ensurePlanned(campaignId)
  const batches = await batchesOf(campaignId)
  check('twelve batches', batches.length === 12, `${batches.length}`)

  for (const batch of batches.slice(0, 6)) {
    await confirmBatch(
      batch.id,
      campaignId,
      batch.links.map((link) => ({ linkId: link.id, balanceId: fakeBalanceId() })),
    )
  }
  for (const batch of batches.slice(6)) {
    await markBatchFailed(batch.id, campaignId, 'tx_failed')
  }

  const after = await batchesOf(campaignId)
  const confirmed = after.filter((b) => b.status === 'CONFIRMED')
  const failed = after.filter((b) => b.status === 'FAILED')

  check('batches 1–6 are confirmed', confirmed.map((b) => b.sequence).join(',') === '1,2,3,4,5,6', confirmed.map((b) => b.sequence).join(','))
  check('batches 7–12 are failed', failed.map((b) => b.sequence).join(',') === '7,8,9,10,11,12', failed.map((b) => b.sequence).join(','))
  check('confirmed links are ACTIVE', confirmed.every((b) => b.links.every((l) => l.status === 'ACTIVE')))
  check('failed links are FAILED', failed.every((b) => b.links.every((l) => l.status === 'FAILED')))

  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { status: true } })
  check('the campaign is PARTIAL', campaign.status === 'PARTIAL', campaign.status)

  // The CSV must not offer a link that has no on-chain entry.
  const claimable = await prisma.claimLink.count({ where: { campaignId, status: 'ACTIVE' } })
  check('only the confirmed links are claimable', claimable === 6 * SIZE, `${claimable}`)
}

async function balanceIdFollowsConfirmation(): Promise<void> {
  console.log('\n3. balanceId is null for every link whose batch is not CONFIRMED')

  const user = await makeUser()
  const campaignId = await makeCampaign(user, 3, Keypair.random())
  await ensurePlanned(campaignId)
  const [batch] = await batchesOf(campaignId)

  const before = await prisma.claimLink.count({ where: { campaignId, balanceId: { not: null } } })
  check('no balance ID before confirmation', before === 0, `${before}`)

  await prisma.batch.update({ where: { id: batch!.id }, data: { status: 'SUBMITTED', transactionHash: randomUUID() } })
  const submitted = await prisma.claimLink.count({ where: { campaignId, balanceId: { not: null } } })
  check('no balance ID while merely SUBMITTED', submitted === 0, `${submitted}`)

  await confirmBatch(batch!.id, campaignId, batch!.links.map((l) => ({ linkId: l.id, balanceId: fakeBalanceId() })))
  const confirmed = await prisma.claimLink.count({ where: { campaignId, balanceId: { not: null } } })
  check('balance IDs appear on confirmation', confirmed === 3, `${confirmed}`)

  const stray = await prisma.claimLink.count({
    where: { campaignId, balanceId: { not: null }, batch: { status: { not: 'CONFIRMED' } } },
  })
  check('no link carries a balance ID for an unconfirmed batch', stray === 0, `${stray}`)
}

async function activationWaitsForTheCsv(): Promise<void> {
  console.log('\n4. A fully confirmed campaign waits in CREATING until the CSV is exported')

  const user = await makeUser()
  const campaignId = await makeCampaign(user, 5, Keypair.random())
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'CREATING' } })
  await ensurePlanned(campaignId)
  const [batch] = await batchesOf(campaignId)

  await confirmBatch(batch!.id, campaignId, batch!.links.map((l) => ({ linkId: l.id, balanceId: fakeBalanceId() })))
  const held = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { status: true } })
  check('still CREATING with no CSV export', held.status === 'CREATING', held.status)

  const { settleCampaignStatus } = await import('../src/lib/api/batches')
  await prisma.campaign.update({ where: { id: campaignId }, data: { csvExportedAt: new Date() } })
  await settleCampaignStatus(campaignId)
  const live = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { status: true } })
  check('ACTIVE once the sender holds the seeds', live.status === 'ACTIVE', live.status)
}

async function retryTouchesOnlyFailedLinks(): Promise<void> {
  console.log('\n5. Retry rebuilds only the failed links')

  const user = await makeUser()
  const sender = Keypair.random()
  const campaignId = await makeCampaign(user, 3 * SIZE, sender)
  await ensurePlanned(campaignId)
  const batches = await batchesOf(campaignId)

  await confirmBatch(batches[0]!.id, campaignId, batches[0]!.links.map((l) => ({ linkId: l.id, balanceId: fakeBalanceId() })))
  await confirmBatch(batches[1]!.id, campaignId, batches[1]!.links.map((l) => ({ linkId: l.id, balanceId: fakeBalanceId() })))
  await markBatchFailed(batches[2]!.id, campaignId, 'tx_insufficient_fee')

  const failedLinkIds = batches[2]!.links.map((l) => l.id).sort()

  const outcome = await retryFailedBatches(campaignId, orgOf(user))
  check('retry reports the failed sequence', outcome.kind === 'ok' && outcome.value.retried.join(',') === '3', JSON.stringify(outcome))

  const after = await batchesOf(campaignId)
  const reopened = after.find((b) => b.sequence === 3)!
  check('the failed batch is PENDING again', reopened.status === 'PENDING', reopened.status)
  check('its links are PENDING again', reopened.links.every((l) => l.status === 'PENDING'))
  check('it holds exactly the previously failed links', JSON.stringify(reopened.links.map((l) => l.id).sort()) === JSON.stringify(failedLinkIds))

  check('confirmed batches are untouched', after.slice(0, 2).every((b) => b.status === 'CONFIRMED'))
  check('their links keep their balance IDs', after.slice(0, 2).every((b) => b.links.every((l) => l.balanceId !== null && l.status === 'ACTIVE')))

  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { status: true } })
  check('the campaign is building again', campaign.status === 'CREATING', campaign.status)

  // The transaction the next prepare would build carries only those links.
  const built = buildBatchTransaction({
    senderAccount: new Account(sender.publicKey(), '100'),
    senderPublicKey: sender.publicKey(),
    asset: Asset.native(),
    amountPerLink: '2.5000000',
    expiresAt: EXPIRES,
    links: reopened.links,
    networkPassphrase: Networks.TESTNET,
    baseFee: '1000',
    timeoutSeconds: 300,
  })
  const tx = TransactionBuilder.fromXDR(built.xdr, Networks.TESTNET) as Transaction
  check('the rebuilt transaction has one operation per failed link', tx.operations.length === reopened.links.length, `${tx.operations.length}`)

  const destinations = new Set(
    tx.operations.flatMap((op) => (op.type === 'createClaimableBalance' ? op.claimants.map((c) => c.destination) : [])),
  )
  const confirmedKeys = after.slice(0, 2).flatMap((b) => b.links.map((l) => l.ephemeralPublicKey))
  check('and none of the already-confirmed links', confirmedKeys.every((key) => !destinations.has(key)))
}

async function resubmissionIsANoOp(): Promise<void> {
  console.log('\n6. Re-submitting a batch returns the original result without touching the network')

  const user = await makeUser()
  const campaignId = await makeCampaign(user, 2, Keypair.random())
  await ensurePlanned(campaignId)
  const [batch] = await batchesOf(campaignId)

  const hash = randomUUID().replace(/-/g, '')
  await prisma.batch.update({
    where: { id: batch!.id },
    data: { status: 'SUBMITTED', transactionHash: hash, submittedAt: new Date() },
  })

  // A deliberately invalid envelope: reaching verification or Horizon at all
  // would be the bug. The replay must return before either.
  const outcome = await submitBatch(campaignId, orgOf(user), { sequence: 1, signedXdr: 'not-a-transaction' })

  check('the replay succeeds', outcome.kind === 'ok', JSON.stringify(outcome))
  check('it returns the original hash', outcome.kind === 'ok' && outcome.value.transactionHash === hash)
  check('it is marked as a replay', outcome.kind === 'ok' && outcome.value.replay === true)

  const count = await prisma.batch.count({ where: { campaignId } })
  check('no second batch was created', count === 1, `${count}`)
}

/** Shaped like a claimable balance ID; never read as one by these checks. */
function fakeBalanceId(): string {
  return `00000000${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`.slice(0, 72)
}

/**
 * The ordering the whole positional design rests on.
 *
 * `createdAt` defaults to CURRENT_TIMESTAMP, which in Postgres is TRANSACTION
 * time — so every link registered by one `createMany` shares a timestamp to
 * the millisecond, and `ORDER BY "createdAt"` over 90 equal keys is not a
 * total order. Postgres promises nothing about which permutation comes back:
 * the sort is unstable and its input is whatever the scan produced, which
 * ordinary row updates change by relocating tuples.
 *
 * Not theoretical. Updating a slice of the links so their tuples move is
 * enough to get a different permutation from the same query.
 */
async function linkOrderIsTotal(): Promise<void> {
  console.log('\n7. Link order is stable across ordinary row rewrites')

  const user = await makeUser()
  const campaignId = await makeCampaign(user, 90, Keypair.random())

  const rows = await prisma.$queryRawUnsafe<{ createdAt: Date }[]>(
    'SELECT "createdAt" FROM "ClaimLink" WHERE "campaignId" = $1',
    campaignId,
  )
  const distinct = new Set(rows.map((r) => r.createdAt.toISOString()))
  check(
    'the premise holds — links registered together share a timestamp',
    distinct.size < rows.length,
    `${distinct.size} distinct timestamps across ${rows.length} links`,
  )

  const order = async (stable: boolean) =>
    (
      await prisma.claimLink.findMany({
        where: { campaignId },
        orderBy: stable ? LINK_ORDER : { createdAt: 'asc' },
        select: { id: true },
      })
    )
      .map((l) => l.id)
      .join(',')

  const naiveBefore = await order(false)
  const stableBefore = await order(true)

  // A non-HOT update relocates the tuple, changing what a seq scan feeds the sort.
  const middle = stableBefore.split(',').slice(30, 45)
  await prisma.claimLink.updateMany({
    where: { id: { in: middle } },
    data: { label: 'relocated'.repeat(200) },
  })

  const naiveAfter = await order(false)
  check(
    'createdAt alone does NOT survive it — the reason this check exists',
    naiveBefore !== naiveAfter,
    'the permutation happened to hold; the guarantee still does not exist',
  )
  check('LINK_ORDER does survive it', stableBefore === (await order(true)))
}

async function main(): Promise<void> {
  try {
    await planningIsStable()
    await partialFailureIsHonest()
    await balanceIdFollowsConfirmation()
    await activationWaitsForTheCsv()
    await retryTouchesOnlyFailedLinks()
    await resubmissionIsANoOp()
    await linkOrderIsTotal()
  } finally {
    await prisma.$disconnect()
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
