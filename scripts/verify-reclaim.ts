/**
 * Verification for the reclaim acceptance criteria on #13. Real Postgres.
 *
 * The ledger reads and the network submit are INJECTED, for the reason spelled
 * out in verify-reconcile.ts: reclaim's defining rule is that the LEDGER, not
 * the database, decides what may be reclaimed, so a check that passes whenever
 * Horizon is unreachable proves nothing about the rule it claims to test.
 *
 * The envelopes here are really signed by a real keypair and really parsed by
 * the SDK — only the network boundary is faked. A stubbed verifier would make
 * every security check below vacuous.
 *
 * Run: pnpm verify:reclaim
 */
import { randomUUID } from 'node:crypto'
import { Account, Keypair, Operation, TransactionBuilder, type Transaction } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { env } = await import('../src/lib/config/env')
const { prepareReclaim, submitReclaim, settleReclaimStatus, reclaimPrepareSchema } = await import(
  '../src/lib/api/reclaim'
)

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const AMOUNT = '2.5000000'

interface Fixture {
  userId: string
  organizationId: string
  campaignId: string
  sender: Keypair
  links: { id: string; balanceId: string }[]
}

/** A campaign whose links are ACTIVE with balance ids, expired by default. */
async function fixture(
  count: number,
  opts: { expiresAt?: Date; amount?: string } = {},
): Promise<Fixture> {
  const user = await prisma.user.create({
    data: { username: `reclaim-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' },
    select: { id: true },
  })
  const sender = Keypair.random()
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      organizationId: await personalOrg(prisma, user.id),
      name: 'verify-reclaim',
      network: 'testnet',
      senderPublicKey: sender.publicKey(),
      assetCode: 'XLM',
      amountPerLink: opts.amount ?? AMOUNT,
      linkCount: count,
      // Default is in the PAST: reclaim is an after-expiry action, so an
      // expired campaign is the ordinary fixture, not the exception.
      expiresAt: opts.expiresAt ?? new Date(Date.now() - 86_400_000),
      status: 'EXPIRED',
    },
    select: { id: true },
  })

  const links = []
  for (let i = 0; i < count; i += 1) {
    const balanceId = `00000000${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`.slice(0, 72)
    const row = await prisma.claimLink.create({
      data: {
        campaignId: campaign.id,
        ephemeralPublicKey: Keypair.random().publicKey(),
        status: 'ACTIVE',
        balanceId,
      },
      select: { id: true },
    })
    links.push({ id: row.id, balanceId })
  }

  return { userId: user.id, organizationId: `org_${user.id}`, campaignId: campaign.id, sender, links }
}

/** A ledger holding exactly these balances, each for `amount`. */
const ledgerHolding = (ids: string[], amount = AMOUNT) => async () =>
  new Map(ids.map((id) => [id, amount]))

const account = (sender: Keypair) => async () => new Account(sender.publicKey(), '1')

/** Records what was submitted instead of sending it. */
function recordingSubmit() {
  const sent: Transaction[] = []
  return { sent, submit: async (t: Transaction) => void sent.push(t) }
}

const deps = (f: Fixture, ledger: string[], sink = recordingSubmit()) => ({
  readBalances: ledgerHolding(ledger),
  loadAccount: account(f.sender),
  submit: sink.submit,
  sink,
})

/** Signs a prepared envelope the way the sender's wallet would. */
function sign(xdr: string, keypair: Keypair): string {
  const transaction = TransactionBuilder.fromXDR(xdr, env.NETWORK_PASSPHRASE) as Transaction
  transaction.sign(keypair)
  return transaction.toXDR()
}

async function refusesBeforeExpiry(): Promise<void> {
  console.log('\n1. Prepare before expiresAt is refused')
  const f = await fixture(2, { expiresAt: new Date(Date.now() + 86_400_000) })
  const d = deps(f, f.links.map((l) => l.balanceId))

  const outcome = await prepareReclaim(f.campaignId, f.organizationId, d)
  check('it is refused', outcome.kind === 'conflict', outcome.kind)
  check('as not-expired, which the panel must NOT read as nothing-left',
    outcome.kind === 'conflict' && outcome.reason === 'not-expired', JSON.stringify(outcome))
  check(
    'and says why, naming the date',
    outcome.kind === 'conflict' && /does not expire until/.test(outcome.detail),
    outcome.kind === 'conflict' ? outcome.detail : '',
  )
}

async function derivesOpsFromTheLedger(): Promise<void> {
  console.log('\n2. The op list comes from the ledger, not the rows')
  const f = await fixture(3)
  // Every row says ACTIVE. The ledger holds only ONE of them — the other two
  // were claimed by recipients and the database has not caught up.
  const live = [f.links[1]!.balanceId]
  const outcome = await prepareReclaim(f.campaignId, f.organizationId, deps(f, live))

  check('it prepares', outcome.kind === 'ok', JSON.stringify(outcome))
  if (outcome.kind !== 'ok') return
  check('one operation, not three', outcome.value.balanceCount === 1, `${outcome.value.balanceCount}`)

  const transaction = TransactionBuilder.fromXDR(outcome.value.xdr, env.NETWORK_PASSPHRASE) as Transaction
  const ids = transaction.operations.map((op) => (op.type === 'claimClaimableBalance' ? op.balanceId : 'other'))
  check('and it is the one the ledger still holds', ids.length === 1 && ids[0] === live[0], JSON.stringify(ids))
}

async function batchesAtNinety(): Promise<void> {
  console.log('\n3. 200 unclaimed links produce exactly 3 batches, walked by re-preparing')
  const f = await fixture(200)
  const all = f.links.map((l) => l.balanceId)
  const first = await prepareReclaim(f.campaignId, f.organizationId, deps(f, all))

  check('it prepares', first.kind === 'ok', JSON.stringify(first))
  if (first.kind !== 'ok') return
  check('exactly 3 batches remain', first.value.batchesRemaining === 3, `${first.value.batchesRemaining}`)
  check('the first holds 90', first.value.balanceCount === 90, `${first.value.balanceCount}`)

  /*
   * There is no `sequence` to ask for batch 2 with. `prepare` always builds
   * the first batch of what the ledger STILL holds, so a client walks the set
   * by submitting and preparing again — the shrinking set is the cursor.
   * (A `sequence` parameter existed and would have skipped 91–180 once batch
   * 1 landed; the review on #34 caught it.)
   */
  const afterFirst = all.slice(90)
  const second = await prepareReclaim(f.campaignId, f.organizationId, deps(f, afterFirst))
  check('after batch 1 lands, 2 remain', second.kind === 'ok' && second.value.batchesRemaining === 2,
    second.kind === 'ok' ? `${second.value.batchesRemaining}` : second.kind)
  check('and the next holds 90 — links 91–180, not 181–200',
    second.kind === 'ok' && second.value.balanceCount === 90,
    second.kind === 'ok' ? `${second.value.balanceCount}` : second.kind)

  const afterSecond = all.slice(180)
  const third = await prepareReclaim(f.campaignId, f.organizationId, deps(f, afterSecond))
  check('the third holds the remaining 20', third.kind === 'ok' && third.value.balanceCount === 20,
    third.kind === 'ok' ? `${third.value.balanceCount}` : third.kind)

  const fourth = await prepareReclaim(f.campaignId, f.organizationId, deps(f, []))
  check('then nothing is left, and it says so by reason, not only by prose',
    fourth.kind === 'conflict' && fourth.reason === 'nothing-left',
    JSON.stringify(fourth))

  const sequence = reclaimPrepareSchema.safeParse({ sequence: 2 })
  check('a `sequence` in the body is rejected', !sequence.success)
}

async function survivesAClaimWhileSigning(): Promise<void> {
  console.log('\n4. A balance claimed while the sender signs does not fail the batch')
  const f = await fixture(3)
  const all = f.links.map((l) => l.balanceId)
  const prepared = await prepareReclaim(f.campaignId, f.organizationId, deps(f, all))
  if (prepared.kind !== 'ok') return check('prepared', false, prepared.kind)

  const signed = sign(prepared.value.xdr, f.sender)

  // While the sender was in their wallet, a recipient claimed link 2.
  const shrunk = all.filter((id) => id !== f.links[1]!.balanceId)
  const d = deps(f, shrunk)
  const outcome = await submitReclaim(f.campaignId, f.organizationId, { signedXdr: signed }, d)

  check('the stale envelope is refused', outcome.kind === 'conflict', outcome.kind)
  check(
    'and the sender is told to prepare again',
    outcome.kind === 'conflict' && /[Pp]repare the reclaim again/.test(outcome.detail),
    outcome.kind === 'conflict' ? outcome.detail : '',
  )
  check('nothing was sent to the network', d.sink.sent.length === 0, `${d.sink.sent.length}`)

  const untouched = await prisma.claimLink.count({
    where: { campaignId: f.campaignId, status: 'RECLAIMED' },
  })
  check('and no row was marked reclaimed', untouched === 0, `${untouched}`)

  // Preparing again yields the two that remain, and that one submits.
  const again = await prepareReclaim(f.campaignId, f.organizationId, d)
  if (again.kind !== 'ok') return check('it prepares again', false, again.kind)
  check('the rebuilt batch drops the claimed one', again.value.balanceCount === 2, `${again.value.balanceCount}`)

  const retried = await submitReclaim(f.campaignId, f.organizationId, { signedXdr: sign(again.value.xdr, f.sender) }, d)
  check('and the rest are returned', retried.kind === 'ok', JSON.stringify(retried))
  check('two balances', retried.kind === 'ok' && retried.value.balanceCount === 2)
}

async function recordsWhatTheLedgerSaid(): Promise<void> {
  console.log('\n5. Rows and amounts come from the ledger, exactly')
  const f = await fixture(2)
  const all = f.links.map((l) => l.balanceId)
  // Deliberately NOT amountPerLink: the ledger is authoritative about what is
  // actually there, and a partial claim or a different funding would diverge.
  const d = deps(f, all)
  d.readBalances = async () => new Map([[all[0]!, '0.1000000'], [all[1]!, '0.2000000']])

  const prepared = await prepareReclaim(f.campaignId, f.organizationId, d)
  if (prepared.kind !== 'ok') return check('prepared', false, prepared.kind)
  check('the quoted total is the ledger sum', prepared.value.amount === '0.3', prepared.value.amount)
  check('and not the float answer', prepared.value.amount !== `${0.1 + 0.2}`, prepared.value.amount)

  const outcome = await submitReclaim(f.campaignId, f.organizationId, { signedXdr: sign(prepared.value.xdr, f.sender) }, d)
  check('it submits', outcome.kind === 'ok', JSON.stringify(outcome))
  if (outcome.kind !== 'ok') return

  check('one transaction was sent', d.sink.sent.length === 1, `${d.sink.sent.length}`)
  const hash = d.sink.sent[0]!.hash().toString('hex')
  check('recorded under the hash that was sent', outcome.value.transactionHash === hash)

  const links = await prisma.claimLink.findMany({
    where: { campaignId: f.campaignId },
    select: { status: true, claimTxHash: true, claimedBy: true },
  })
  check('every link is RECLAIMED', links.every((l) => l.status === 'RECLAIMED'), JSON.stringify(links.map((l) => l.status)))
  check('each carries the transaction hash', links.every((l) => l.claimTxHash === hash))
  check('and records the sender as the recipient', links.every((l) => l.claimedBy === f.sender.publicKey()))

  const stored = await prisma.reclaimBatch.findUniqueOrThrow({
    where: { transactionHash: hash },
    select: { amount: true, balanceCount: true },
  })
  check('the reclaim total is exact', new Decimal(stored.amount.toString()).equals(new Decimal('0.3')), stored.amount.toString())
  check('over two balances', stored.balanceCount === 2, `${stored.balanceCount}`)

  /*
   * One stroop. Decimal's toString() renders it as "1e-7", which Postgres
   * parses but a sender reading "1e-7 XLM" does not — §4.1 is about money
   * being unambiguous where a person acts on it.
   */
  const stroop = await fixture(1)
  const one = deps(stroop, [stroop.links[0]!.balanceId])
  one.readBalances = async () => new Map([[stroop.links[0]!.balanceId, '0.0000001']])
  const smallest = await prepareReclaim(stroop.campaignId, stroop.organizationId, one)
  check('one stroop is quoted as 0.0000001, not 1e-7',
    smallest.kind === 'ok' && smallest.value.amount === '0.0000001',
    smallest.kind === 'ok' ? smallest.value.amount : smallest.kind)
  if (smallest.kind === 'ok') {
    const sent = await submitReclaim(stroop.campaignId, stroop.organizationId, { signedXdr: sign(smallest.value.xdr, stroop.sender) }, one)
    check('and submitted the same way', sent.kind === 'ok' && sent.value.amount === '0.0000001',
      sent.kind === 'ok' ? sent.value.amount : sent.kind)
  }

  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: f.campaignId },
    select: { status: true },
  })
  check('the campaign is RECLAIMED', campaign.status === 'RECLAIMED', campaign.status)
  check('and the response agrees', outcome.value.campaignStatus === 'RECLAIMED', outcome.value.campaignStatus)
  check('with nothing remaining', outcome.value.remaining === 0, `${outcome.value.remaining}`)
}

async function refusesAnotherCampaignsBalance(): Promise<void> {
  console.log("\n6. An envelope reaching for another campaign's funds")
  const victim = await fixture(1)
  const attacker = await fixture(1)

  /*
   * The attacker owns their own campaign and signs with their own key, but
   * builds an operation against the VICTIM's balance id. Nothing about the
   * envelope is malformed — the only thing wrong with it is authorisation.
   */
  const builder = new TransactionBuilder(new Account(attacker.sender.publicKey(), '1'), {
    fee: env.BASE_FEE_STROOPS,
    networkPassphrase: env.NETWORK_PASSPHRASE,
  })
  builder.addOperation(
    Operation.claimClaimableBalance({
      balanceId: victim.links[0]!.balanceId,
      source: attacker.sender.publicKey(),
    }),
  )
  const transaction = builder.setTimeout(600).build()
  transaction.sign(attacker.sender)

  const ledger = [victim.links[0]!.balanceId, attacker.links[0]!.balanceId]
  const d = deps(attacker, ledger)
  const outcome = await submitReclaim(
    attacker.campaignId,
    attacker.organizationId,
    { signedXdr: transaction.toXDR() },
    d,
  )

  check('it is refused', outcome.kind === 'conflict', JSON.stringify(outcome))
  check(
    'as not belonging to this campaign',
    outcome.kind === 'conflict' && /do not belong to this campaign/.test(outcome.detail),
    outcome.kind === 'conflict' ? outcome.detail : '',
  )
  check('nothing was sent', d.sink.sent.length === 0, `${d.sink.sent.length}`)

  const victimLink = await prisma.claimLink.findUniqueOrThrow({
    where: { id: victim.links[0]!.id },
    select: { status: true },
  })
  check("and the victim's link is untouched", victimLink.status === 'ACTIVE', victimLink.status)
}

async function refusesASmuggledOperation(): Promise<void> {
  console.log('\n7. An envelope carrying an extra operation')
  const f = await fixture(1)
  const all = f.links.map((l) => l.balanceId)

  const builder = new TransactionBuilder(new Account(f.sender.publicKey(), '1'), {
    fee: env.BASE_FEE_STROOPS,
    networkPassphrase: env.NETWORK_PASSPHRASE,
  })
  builder.addOperation(
    Operation.claimClaimableBalance({ balanceId: all[0]!, source: f.sender.publicKey() }),
  )
  // The reclaim the sender expected, plus a payment they did not.
  builder.addOperation(
    Operation.payment({
      destination: Keypair.random().publicKey(),
      asset: (await import('@stellar/stellar-sdk')).Asset.native(),
      amount: '100.0000000',
      source: f.sender.publicKey(),
    }),
  )
  const transaction = builder.setTimeout(600).build()
  transaction.sign(f.sender)

  const d = deps(f, all)
  const outcome = await submitReclaim(f.campaignId, f.organizationId, { signedXdr: transaction.toXDR() }, d)

  check('it is refused', outcome.kind === 'conflict', JSON.stringify(outcome))
  check('nothing was sent', d.sink.sent.length === 0, `${d.sink.sent.length}`)
}

async function replayDoesNotDoubleRecord(): Promise<void> {
  console.log('\n8. The same signed envelope arriving twice')
  const f = await fixture(2)
  const all = f.links.map((l) => l.balanceId)
  const d = deps(f, all)

  const prepared = await prepareReclaim(f.campaignId, f.organizationId, d)
  if (prepared.kind !== 'ok') return check('prepared', false, prepared.kind)
  const signed = sign(prepared.value.xdr, f.sender)

  const first = await submitReclaim(f.campaignId, f.organizationId, { signedXdr: signed }, d)
  check('the first submits', first.kind === 'ok' && !first.value.replay, JSON.stringify(first))

  const second = await submitReclaim(f.campaignId, f.organizationId, { signedXdr: signed }, d)
  check('the second is a replay', second.kind === 'ok' && second.value.replay === true, JSON.stringify(second))
  check(
    'reporting the same hash',
    first.kind === 'ok' && second.kind === 'ok' && first.value.transactionHash === second.value.transactionHash,
  )
  check(
    'and the same amount',
    first.kind === 'ok' && second.kind === 'ok' && first.value.amount === second.value.amount,
  )
  check('the network saw it once', d.sink.sent.length === 1, `${d.sink.sent.length}`)

  const recorded = await prisma.reclaimBatch.count({ where: { campaignId: f.campaignId } })
  check('one reclaim was recorded, not two', recorded === 1, `${recorded}`)
}

/**
 * Two identical submissions arriving together.
 *
 * The replay check reads before it writes, so both calls can pass it. The
 * unique hash is what actually holds the line — this proves losing that race
 * answers the sender a reclaim, not a 500 about a refund that succeeded.
 */
async function concurrentSubmitsRecordOnce(): Promise<void> {
  console.log('\n9. The same envelope submitted twice at once')
  const f = await fixture(2)
  const all = f.links.map((l) => l.balanceId)
  const d = deps(f, all)

  const prepared = await prepareReclaim(f.campaignId, f.organizationId, d)
  if (prepared.kind !== 'ok') return check('prepared', false, prepared.kind)
  const signed = sign(prepared.value.xdr, f.sender)

  /*
   * A barrier in the injected submit, because Promise.all is not enough.
   *
   * Both calls read "no reclaim recorded" and then write, and without forcing
   * them to overlap the first finishes its write before the second reads — the
   * race never happens and the check passes no matter what the code does.
   * Verified: with the collision handler removed, this section fails.
   */
  let release: () => void
  const bothArrived = new Promise<void>((resolve) => { release = resolve })
  let arrived = 0
  const sent: Transaction[] = []
  const barrier = {
    ...d,
    submit: async (t: Transaction) => {
      sent.push(t)
      arrived += 1
      if (arrived === 2) release()
      await bothArrived
    },
  }

  const [a, b] = await Promise.all([
    submitReclaim(f.campaignId, f.organizationId, { signedXdr: signed }, barrier),
    submitReclaim(f.campaignId, f.organizationId, { signedXdr: signed }, barrier),
  ])

  check('both reached the write', sent.length === 2, `${sent.length}`)

  check('both callers get an answer', a.kind === 'ok' && b.kind === 'ok', `${a.kind} / ${b.kind}`)
  check(
    'reporting the same hash',
    a.kind === 'ok' && b.kind === 'ok' && a.value.transactionHash === b.value.transactionHash,
  )
  check(
    'and the same amount',
    a.kind === 'ok' && b.kind === 'ok' && a.value.amount === b.value.amount,
    a.kind === 'ok' && b.kind === 'ok' ? `${a.value.amount} / ${b.value.amount}` : '',
  )

  const recorded = await prisma.reclaimBatch.count({ where: { campaignId: f.campaignId } })
  check('exactly one reclaim was recorded', recorded === 1, `${recorded}`)

  const links = await prisma.claimLink.findMany({
    where: { campaignId: f.campaignId },
    select: { status: true },
  })
  check('every link is RECLAIMED once', links.every((l) => l.status === 'RECLAIMED'))
}

async function doesNotClaimAFullyClaimedCampaign(): Promise<void> {
  console.log('\n10. A campaign whose links were all claimed by recipients')
  const f = await fixture(2)
  await prisma.claimLink.updateMany({
    where: { campaignId: f.campaignId },
    data: { status: 'CLAIMED' },
  })

  // The ledger holds nothing: the recipients took it all.
  const d = deps(f, [])
  const outcome = await prepareReclaim(f.campaignId, f.organizationId, d)
  check('there is nothing to reclaim', outcome.kind === 'conflict', outcome.kind)
  check(
    'and it says so plainly',
    outcome.kind === 'conflict' && /nothing left to reclaim/.test(outcome.detail),
    outcome.kind === 'conflict' ? outcome.detail : '',
  )

  const state = await settleReclaimStatus(f.campaignId)
  check('the campaign does NOT become RECLAIMED', state.status !== 'RECLAIMED', state.status)
}

async function main(): Promise<void> {
  try {
    await refusesBeforeExpiry()
    await derivesOpsFromTheLedger()
    await batchesAtNinety()
    await survivesAClaimWhileSigning()
    await recordsWhatTheLedgerSaid()
    await refusesAnotherCampaignsBalance()
    await refusesASmuggledOperation()
    await replayDoesNotDoubleRecord()
    await concurrentSubmitsRecordOnce()
    await doesNotClaimAFullyClaimedCampaign()
  } finally {
    await prisma.$disconnect()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
