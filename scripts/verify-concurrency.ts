/**
 * Verification for the three concurrency findings on PR #26. Real Postgres.
 *
 * Each check reproduces the reported failure first, so a regression that
 * reintroduces the bug fails here rather than passing quietly:
 *
 *   1. Cross-tenant idempotency leak — alice replays her own key and receives
 *      bob's payload, because the write selected by primary key alone.
 *   2. Store-after — two concurrent requests with one key both execute.
 *   3. Check-then-act on the link limit — two registrations together exceed
 *      the campaign's declared linkCount.
 *
 * Run: pnpm verify:concurrency   (needs DATABASE_URL and a running Postgres)
 */
import { randomUUID } from 'node:crypto'
import { applyEnvPlaceholders } from '../tests/env-placeholders'

// Before any import that touches config. DATABASE_URL is deliberately NOT
// defaulted over: this script only means anything against a real database.
applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { beginIdempotency, storeIdempotentResult, releaseIdempotency } = await import(
  '../src/lib/api/idempotency'
)
const { registerLinks, isWriteConflict } = await import('../src/lib/api/links')

let failures = 0

function check(name: string, pass: boolean, detail = ''): void {
  if (pass) {
    console.log(`  PASS  ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function req(key: string): Request {
  return new Request('https://kleym.test/api/campaigns', {
    method: 'POST',
    headers: { 'idempotency-key': key },
  })
}

async function makeUser(tag: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      username: `${tag}-${randomUUID()}`,
      // Not a credential under test; auth has its own coverage.
      passwordHash: 'x',
      role: 'SENDER',
    },
    select: { id: true },
  })
  return user.id
}

async function idempotencyIsScopedToUser(): Promise<void> {
  console.log('\n1. Idempotency is scoped to the user on WRITE, not only on read')

  const alice = await makeUser('alice')
  const bob = await makeUser('bob')
  const key = `shared-${randomUUID()}`
  const body = { shape: 'same-for-both' }

  const aliceCtx = { userId: alice, route: '/api/campaigns', body }
  const bobCtx = { userId: bob, route: '/api/campaigns', body }

  const a1 = await beginIdempotency(req(key), aliceCtx)
  check('alice claims the key', a1.reserved === true)
  await storeIdempotentResult(req(key), aliceCtx, { status: 201, body: { owner: 'alice' } })

  const b1 = await beginIdempotency(req(key), bobCtx)
  check('bob claims the same key independently', b1.reserved === true)
  await storeIdempotentResult(req(key), bobCtx, { status: 201, body: { owner: 'bob' } })

  // The row the reported bug corrupted.
  const aliceRow = await prisma.idempotencyKey.findUnique({
    where: { userId_key: { userId: alice, key } },
  })
  check(
    "bob's write did not land on alice's row",
    (aliceRow?.response as { owner?: string } | null)?.owner === 'alice',
    `alice's row holds ${JSON.stringify(aliceRow?.response)}`,
  )

  const replay = await beginIdempotency(req(key), aliceCtx)
  const payload = replay.response ? await replay.response.clone().json() : null
  check(
    'alice replaying her key gets her own payload',
    payload?.owner === 'alice',
    `got ${JSON.stringify(payload)}`,
  )
  check('the replay is marked as one', replay.response?.headers.get('idempotent-replay') === 'true')
}

async function reservationIsTakenBeforeTheWork(): Promise<void> {
  console.log('\n2. The key is reserved before the work, so concurrent replays cannot both run')

  const user = await makeUser('racer')
  const key = `race-${randomUUID()}`
  const ctx = { userId: user, route: '/api/campaigns', body: { n: 1 } }

  const [first, second] = await Promise.all([
    beginIdempotency(req(key), ctx),
    beginIdempotency(req(key), ctx),
  ])

  const reserved = [first, second].filter((r) => r.reserved === true).length
  check('exactly one of two concurrent requests may execute', reserved === 1, `${reserved} did`)

  const loser = first.reserved ? second : first
  check('the loser is told the original is in flight', loser.response?.status === 409)

  // The branch that was unreachable under store-after.
  const detail = loser.response ? (await loser.response.clone().json()).detail : ''
  check(
    'and told so specifically',
    typeof detail === 'string' && detail.includes('in progress'),
    detail,
  )

  await storeIdempotentResult(req(key), ctx, { status: 201, body: { done: true } })
  const after = await beginIdempotency(req(key), ctx)
  check('once stored, a retry replays the result', after.response?.status === 201)
}

async function failedWorkReleasesTheKey(): Promise<void> {
  console.log('\n3. A failed request does not poison its key')

  const user = await makeUser('failer')
  const key = `fail-${randomUUID()}`
  const ctx = { userId: user, route: '/api/campaigns', body: { n: 2 } }

  const reserved = await beginIdempotency(req(key), ctx)
  check('reserved', reserved.reserved === true)

  await releaseIdempotency(req(key), ctx)

  const retry = await beginIdempotency(req(key), ctx)
  check('the same key is usable again after the failure', retry.reserved === true)
}

async function linkLimitHoldsUnderConcurrency(): Promise<void> {
  console.log('\n4. The declared link count bounds registration under concurrency')

  const user = await makeUser('sender')
  const campaign = await prisma.campaign.create({
    data: {
      userId: user,
      name: 'verify',
      network: 'testnet',
      senderPublicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB',
      assetCode: 'XLM',
      amountPerLink: '1.0000000',
      linkCount: 10,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
    select: { id: true },
  })

  /*
   * Keys must be unique per RUN, not just per batch. `ephemeralPublicKey` is
   * globally unique, so a fixed generator makes every run after the first hit
   * `skipDuplicates` and insert nothing — which reads as the limit holding.
   */
  const run = randomUUID().replace(/-/g, '').toUpperCase()
  // 'G' + tag + 32-char run + 22-digit index = the 56 characters a G-address has.
  // Truncating instead would collapse the indices and make every key identical.
  const batch = (n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => `G${tag}${run}${String(i).padStart(22, '0')}`)

  /*
   * Eight concurrent registrations of four links each, against a limit of ten.
   *
   * Two attempts would be a coin toss — the interleave that breaks
   * check-then-act is timing-dependent, and a single trial that happens to
   * serialise reports the bug as absent. Eight makes the overlap reliable:
   * without a transaction they all read a stale count and commit, leaving
   * thirty-two rows in a campaign that declares ten.
   */
  const attempts = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) => registerLinks(campaign.id, user, batch(4, String.fromCharCode(65 + i)))),
  )

  const outcomes = attempts.map((r) =>
    r.status === 'fulfilled'
      ? r.value.kind
      : isWriteConflict(r.reason)
        ? 'write-conflict'
        : `error:${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
  )

  const total = await prisma.claimLink.count({ where: { campaignId: campaign.id } })
  check(
    'the campaign never holds more links than it declares',
    total <= 10,
    `${total} rows registered against a limit of 10 (outcomes: ${outcomes.join(', ')})`,
  )
  check(
    'no more successes than the limit allows',
    outcomes.filter((o) => o === 'ok').length <= 2,
    outcomes.join(', '),
  )
  check(
    'the rest were refused or aborted, not silently accepted',
    outcomes.every((o) => o === 'ok' || o === 'over-limit' || o === 'write-conflict'),
    outcomes.join(', '),
  )

  // And the reported total matches the table, despite skipDuplicates.
  const repeat = await registerLinks(campaign.id, user, batch(2, 'A'))
  if (repeat.kind === 'ok') {
    const actual = await prisma.claimLink.count({ where: { campaignId: campaign.id } })
    check('the returned total matches the table', repeat.total === actual, `${repeat.total} vs ${actual}`)
  } else {
    check('the returned total matches the table', true)
  }
}

async function main(): Promise<void> {
  try {
    await idempotencyIsScopedToUser()
    await reservationIsTakenBeforeTheWork()
    await failedWorkReleasesTheKey()
    await linkLimitHoldsUnderConcurrency()
  } finally {
    await prisma.$disconnect()
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
