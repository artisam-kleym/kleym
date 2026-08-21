/**
 * End-to-end check of the batch-confirm worker against testnet. Issue #9.
 *
 * Reads a real transaction back off the ledger and drives `confirmOne` through
 * it: balance IDs out of the result XDR, each balance read back from Horizon,
 * links marked ACTIVE. The transaction is the one in tests/fixtures/balance-id.json.
 *
 * Not in per-commit CI — it needs Horizon, and AGENT.md §7.2 keeps network
 * dependence out of the commit gate. Read-only: submits nothing.
 *
 * Run: pnpm verify:confirm   (needs DATABASE_URL, Postgres, and testnet reachable)
 */
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { applyEnvPlaceholders } from '../tests/env-placeholders'

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

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main(): Promise<void> {
  console.log(`\nConfirming testnet transaction ${fixture.transactionHash}`)

  const user = await prisma.user.create({
    data: { username: `confirm-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' },
    select: { id: true },
  })
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
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

  // Created in order: operation index i must line up with link i.
  for (const key of fixture.ephemeralPublicKeys) {
    await prisma.claimLink.create({
      data: { campaignId: campaign.id, batchId: batch.id, ephemeralPublicKey: key },
    })
  }

  const outcome = await confirmOne(batch.id)
  check('the worker confirms the batch', outcome === 'confirmed', outcome)

  const links = await prisma.claimLink.findMany({
    where: { campaignId: campaign.id },
    orderBy: { createdAt: 'asc' },
    select: { ephemeralPublicKey: true, status: true, balanceId: true },
  })

  check('every link is ACTIVE', links.every((l) => l.status === 'ACTIVE'))
  check(
    'each link carries the balance ID the ledger assigned',
    JSON.stringify(links.map((l) => l.balanceId)) === JSON.stringify(fixture.balanceIds),
    JSON.stringify(links.map((l) => l.balanceId)),
  )
  check(
    'and it is mapped to the right ephemeral key',
    JSON.stringify(links.map((l) => l.ephemeralPublicKey)) === JSON.stringify(fixture.ephemeralPublicKeys),
  )

  const row = await prisma.batch.findUniqueOrThrow({
    where: { id: batch.id },
    select: { status: true, confirmedAt: true },
  })
  check('the batch is CONFIRMED with a timestamp', row.status === 'CONFIRMED' && row.confirmedAt !== null)

  // Running twice must not double-write — BullMQ retries after a partial failure.
  const again = await confirmOne(batch.id)
  check('a second run is a no-op', again === 'already-settled', again)

  await prisma.$disconnect()
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
