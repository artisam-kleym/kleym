/**
 * End-to-end check of the batch-confirm worker against testnet. Issue #9.
 *
 * Reads a real transaction back off the ledger and drives `confirmOne` through
 * it: balance IDs out of the result XDR, each balance read back from Horizon,
 * links marked ACTIVE. The transaction is the one in tests/fixtures/balance-id.json.
 *
 * Run twice — once with links enumerating in the transaction's operation order,
 * once in the opposite order. The second is the real assertion: the mapping
 * must come from the LEDGER, not from list position, or a reordering silently
 * writes each link the other one's balance.
 *
 * Not in per-commit CI — it needs Horizon, and AGENT.md §7.2 keeps network
 * dependence out of the commit gate. Read-only: submits nothing.
 *
 * Run: pnpm verify:confirm   (needs DATABASE_URL, Postgres, and testnet reachable)
 */
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { confirmOne } = await import('../src/workers/batch-confirm')

const fixture = JSON.parse(readFileSync('tests/fixtures/balance-id.json', 'utf8')) as {
  transactionHash: string
  senderPublicKey: string
  ephemeralPublicKeys: string[]
  expiresAt: string
  amount: string
  balanceIds: string[]
}

/** Which balance each ephemeral key is actually entitled to, per the ledger. */
const CORRECT = new Map(fixture.ephemeralPublicKeys.map((key, i) => [key, fixture.balanceIds[i]!]))

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/**
 * Builds a campaign around the fixture's transaction and confirms it.
 *
 * Everything is torn down afterwards: `Batch.transactionHash` and
 * `ClaimLink.ephemeralPublicKey` are both unique, so the two orderings cannot
 * exist at once.
 */
async function runConfirm(reversed: boolean): Promise<void> {
  const user = await prisma.user.create({
    data: { username: `confirm-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' },
    select: { id: true },
  })
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      organizationId: await personalOrg(prisma, user.id),
      name: 'verify-confirm',
      network: 'testnet',
      senderPublicKey: fixture.senderPublicKey,
      assetCode: 'XLM',
      amountPerLink: fixture.amount,
      linkCount: fixture.ephemeralPublicKeys.length,
      expiresAt: new Date(fixture.expiresAt),
      status: 'CREATING',
    },
    select: { id: true },
  })
  const batch = await prisma.batch.create({
    data: {
      campaignId: campaign.id,
      sequence: 1,
      status: 'SUBMITTED',
      transactionHash: fixture.transactionHash,
      submittedAt: new Date(),
    },
    select: { id: true },
  })

  const keys = reversed ? [...fixture.ephemeralPublicKeys].reverse() : fixture.ephemeralPublicKeys
  for (const key of keys) {
    await prisma.claimLink.create({
      data: { campaignId: campaign.id, batchId: batch.id, ephemeralPublicKey: key, amount: fixture.amount },
    })
  }

  try {
    const outcome = await confirmOne(batch.id)
    check('the worker confirms the batch', outcome === 'confirmed', outcome)

    const links = await prisma.claimLink.findMany({
      where: { campaignId: campaign.id },
      select: { ephemeralPublicKey: true, status: true, balanceId: true },
    })

    check('every link is ACTIVE', links.every((l) => l.status === 'ACTIVE'))

    /*
     * The assertion that distinguishes a ledger-derived mapping from a
     * positional one: each link must hold the balance ITS OWN key can claim.
     * A count check cannot see a permutation; this can.
     */
    const wrong = links.filter((l) => l.balanceId !== CORRECT.get(l.ephemeralPublicKey))
    check(
      'each link holds the balance its own ephemeral key can claim',
      wrong.length === 0,
      wrong.map((l) => `${l.ephemeralPublicKey.slice(0, 8)}… -> ${l.balanceId?.slice(0, 14)}…`).join(', '),
    )

    const row = await prisma.batch.findUniqueOrThrow({
      where: { id: batch.id },
      select: { status: true, confirmedAt: true },
    })
    check('the batch is CONFIRMED with a timestamp', row.status === 'CONFIRMED' && row.confirmedAt !== null)

    // BullMQ retries after a partial failure; a second run must not double-write.
    const again = await confirmOne(batch.id)
    check('a second run is a no-op', again === 'already-settled', again)
  } finally {
    await prisma.campaign.delete({ where: { id: campaign.id } })
    await prisma.user.delete({ where: { id: user.id } })
  }
}

async function main(): Promise<void> {
  console.log(`\nConfirming testnet transaction ${fixture.transactionHash}`)

  /*
   * Clear anything a previous run left behind. `Batch.transactionHash` and
   * `ClaimLink.ephemeralPublicKey` are unique, so the fixture's transaction can
   * only be modelled once at a time — including across invocations.
   */
  const stale = await prisma.batch.findMany({
    where: { transactionHash: fixture.transactionHash },
    select: { campaignId: true },
  })
  if (stale.length > 0) {
    await prisma.campaign.deleteMany({ where: { id: { in: stale.map((b) => b.campaignId) } } })
  }

  console.log('\n1. Links in the transaction\'s own operation order')
  await runConfirm(false)

  console.log('\n2. The same transaction, links enumerating in the opposite order')
  await runConfirm(true)

  await prisma.$disconnect()
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
