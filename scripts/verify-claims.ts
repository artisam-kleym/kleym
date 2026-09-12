/**
 * Verification for the claim API acceptance criteria on #10. Real Postgres and
 * real Redis.
 *
 * The checks here are the ones that fail by returning 200: a resolve response
 * that distinguishes "no such link" from "already claimed", a prepare that
 * builds a transaction against a database row rather than the ledger, a rate
 * limit that counts the wrong thing.
 *
 * Horizon is stubbed where the check is about Kleym's logic rather than
 * Stellar's. Where the check IS about the chain — that the four permutations
 * actually claim — that belongs on testnet and is scripts/spike-claim.ts, which
 * proved it (AGENT.md §7.2 keeps testnet out of the commit gate).
 *
 * Run: pnpm verify:claims
 */
import { randomUUID } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { redis } = await import('../src/lib/redis/client')
const { resolveLink, unavailableLink } = await import('../src/lib/api/claims')
const { rateLimit } = await import('../src/lib/auth/rate-limit')
const { RESOLVE_LIMIT, CLAIM_LIMIT } = await import('../src/lib/api/claim-problems')

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function makeUser(tag: string): Promise<string> {
  const user = await prisma.user.create({
    data: { username: `${tag}-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' },
    select: { id: true },
  })
  await personalOrg(prisma, user.id)
  return user.id
}

interface LinkOpts {
  status?: 'PENDING' | 'ACTIVE' | 'CLAIMED' | 'EXPIRED' | 'RECLAIMED' | 'FAILED'
  expiresAt?: Date
  campaignStatus?: 'DRAFT' | 'CREATING' | 'ACTIVE' | 'PARTIAL' | 'EXPIRED' | 'RECLAIMED' | 'CANCELLED'
  balanceId?: string | null
}

async function makeLink(opts: LinkOpts = {}): Promise<string> {
  const userId = await makeUser('claimer')
  const campaign = await prisma.campaign.create({
    data: {
      userId,
      organizationId: `org_${userId}`,
      name: 'verify-claims',
      network: 'testnet',
      senderPublicKey: Keypair.random().publicKey(),
      assetCode: 'XLM',
      amountPerLink: '2.5000000',
      linkCount: 1,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 30 * 86_400_000),
      status: opts.campaignStatus ?? 'ACTIVE',
    },
    select: { id: true },
  })
  const key = Keypair.random().publicKey()
  await prisma.claimLink.create({
    data: {
      campaignId: campaign.id,
      ephemeralPublicKey: key,
      status: opts.status ?? 'ACTIVE',
      balanceId: opts.balanceId === undefined ? `00000000${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`.slice(0, 72) : opts.balanceId,
    },
  })
  return key
}

/**
 * The enumeration property. SPEC.md §6.4.
 *
 * A live link is a bearer instrument, so any difference between "no such link"
 * and "expired" hands an attacker a way to walk the keyspace and find live
 * ones. Compared as serialised JSON, because a difference in key ORDER is
 * still a difference on the wire.
 */
async function resolveIsIdentical(): Promise<void> {
  console.log('\n1. resolve answers identically for every unavailable link')

  const unknown = Keypair.random().publicKey()
  const expired = await makeLink({ expiresAt: new Date(Date.now() - 1000) })
  const claimed = await makeLink({ status: 'CLAIMED' })
  const cancelled = await makeLink({ campaignStatus: 'CANCELLED' })
  const pending = await makeLink({ status: 'PENDING' })

  const answers = await Promise.all(
    [unknown, expired, claimed, cancelled, pending].map((k) => resolveLink(k)),
  )
  const serialised = answers.map((a) => JSON.stringify(a))

  check(
    'unknown, expired, claimed, cancelled and pending are byte-identical',
    new Set(serialised).size === 1,
    `${new Set(serialised).size} distinct shapes: ${[...new Set(serialised)].join(' | ').slice(0, 220)}`,
  )
  check('and they match the canonical unavailable shape', serialised[0] === JSON.stringify(unavailableLink()))
  check('which carries no campaign detail at all', !serialised[0]!.includes('verify-claims'))

  const live = await makeLink()
  const answer = await resolveLink(live)
  check('a live link does answer differently', answer.status === 'claimable', JSON.stringify(answer))
  check('and carries what the claim page needs', answer.amount === '2.5' && answer.assetCode === 'XLM', JSON.stringify(answer))

  // The key set must be identical too, or the shapes differ structurally even
  // when every value happens to be null.
  check(
    'both shapes have the same keys',
    JSON.stringify(Object.keys(answer).sort()) === JSON.stringify(Object.keys(unavailableLink()).sort()),
  )
}

/**
 * Rate limits are per endpoint and per IP. AGENT.md §5.6.
 *
 * The failure this catches is a shared bucket: if resolve and claim counted
 * against one key, twenty resolves would exhaust a recipient's ten prepares
 * before they ever tried to claim.
 */
async function limitsAreSeparate(): Promise<void> {
  console.log('\n2. resolve and claim hold separate per-IP budgets')

  /*
   * Unique per RUN. An earlier version drew from 250 addresses, so two runs in
   * quick succession shared a bucket and the second saw the first's counts —
   * three spurious failures, which read as a regression rather than as the
   * check colliding with itself.
   */
  const ip = `verify-${randomUUID()}`

  let allowed = 0
  for (let i = 0; i < RESOLVE_LIMIT.limit + 1; i += 1) {
    const r = await rateLimit(`claims:resolve:${ip}`, RESOLVE_LIMIT.limit, RESOLVE_LIMIT.windowSeconds)
    if (r.allowed) allowed += 1
  }
  check(`the first ${RESOLVE_LIMIT.limit} resolves are allowed`, allowed === RESOLVE_LIMIT.limit, `${allowed}`)
  const twentyFirst = await rateLimit(`claims:resolve:${ip}`, RESOLVE_LIMIT.limit, RESOLVE_LIMIT.windowSeconds)
  check('the 21st is refused', !twentyFirst.allowed)

  // Same IP, different endpoint: exhausting resolve must not exhaust claim.
  const claimFirst = await rateLimit(`claims:claim:${ip}`, CLAIM_LIMIT.limit, CLAIM_LIMIT.windowSeconds)
  check('claim from the same IP is unaffected', claimFirst.allowed)

  let claimAllowed = 1
  for (let i = 1; i < CLAIM_LIMIT.limit; i += 1) {
    if ((await rateLimit(`claims:claim:${ip}`, CLAIM_LIMIT.limit, CLAIM_LIMIT.windowSeconds)).allowed) claimAllowed += 1
  }
  check(`the first ${CLAIM_LIMIT.limit} claims are allowed`, claimAllowed === CLAIM_LIMIT.limit, `${claimAllowed}`)
  const eleventh = await rateLimit(`claims:claim:${ip}`, CLAIM_LIMIT.limit, CLAIM_LIMIT.windowSeconds)
  check('the 11th is refused', !eleventh.allowed)

  const otherIp = await rateLimit(`claims:claim:verify-${randomUUID()}`, CLAIM_LIMIT.limit, CLAIM_LIMIT.windowSeconds)
  check('another IP is unaffected', otherIp.allowed)
}

/**
 * The row is not the authority. AGENT.md §4.2.
 *
 * `loadClaimable` is exercised through `resolveLink`'s sibling path by driving
 * the states it must refuse. The ledger read itself is stubbed here; that it
 * reads the ledger AT ALL is the property under test.
 */
/**
 * The row is not the authority. AGENT.md §4.2.
 *
 * The ledger read is stubbed, which is the point: these assert on the REASON
 * each link is refused, not merely that it was. An earlier version asserted
 * only "not ok" and passed with the expiry check deleted — Horizon happened to
 * be unreachable for the throwaway sponsor key, so the call failed for an
 * unrelated reason and the check read as green.
 */
async function staleRowsAreRefused(): Promise<void> {
  console.log('\n3. prepare refuses what the row alone would allow')

  const { loadClaimable } = await import('../src/lib/api/claims')

  /** Pretends the balance is still on the ledger. */
  const present: Parameters<typeof loadClaimable>[1] = async (balanceId) => ({
    id: balanceId,
    asset: 'native',
    amount: '2.5000000',
    claimants: [],
  })
  /** Pretends it is gone — claimed or reclaimed already. */
  const absent: Parameters<typeof loadClaimable>[1] = async () => null

  const live = await makeLink()
  const ok = await loadClaimable(live, present)
  check('a live link with a live balance loads', ok.kind === 'ok', JSON.stringify(ok).slice(0, 140))

  /*
   * Acceptance criterion 2, and the one that most needs a stub: the row still
   * says ACTIVE and the balance is gone. Without the ledger read this returns
   * a preparable link and Kleym builds a transaction against nothing.
   */
  const vanished = await loadClaimable(live, absent)
  check(
    'an ACTIVE row whose balance has left the ledger is refused, with the reason the page reads',
    vanished.kind === 'conflict' && vanished.reason === 'already-claimed',
    JSON.stringify(vanished).slice(0, 140),
  )

  const expired = await makeLink({ expiresAt: new Date(Date.now() - 1000) })
  const past = await loadClaimable(expired, present)
  check(
    'an ACTIVE row past expiresAt is refused as expired, with the reason the page reads',
    past.kind === 'conflict' && past.reason === 'expired',
    JSON.stringify(past).slice(0, 140),
  )

  for (const [name, key] of [
    ['a link with no balance ID', await makeLink({ balanceId: null })],
    ['an already-CLAIMED link', await makeLink({ status: 'CLAIMED' })],
    ['a PENDING link', await makeLink({ status: 'PENDING' })],
    ['a cancelled campaign', await makeLink({ campaignStatus: 'CANCELLED' })],
    ['an unknown key', Keypair.random().publicKey()],
  ] as const) {
    const outcome = await loadClaimable(key, present)
    check(`${name} is not found`, outcome.kind === 'not-found', JSON.stringify(outcome).slice(0, 140))
  }
}

/**
 * submit must bind the envelope to the link it updates. Reported on #31.
 *
 * `ephemeralPublicKey` and `signedXdr` arrive as two independent inputs. Before
 * the binding check, a valid TX2 prepared for link A — which A's own holder
 * obtains legitimately — could be posted under link B's public key: the submit
 * succeeded, and B's row was written CLAIMED with A's hash and the attacker's
 * address while B's balance sat untouched on the ledger.
 *
 * That made knowing a PUBLIC KEY sufficient to destroy a link. The design rests
 * on the opposite — the seed is the bearer instrument, the public key is not.
 *
 * Horizon is injected, so these assert on which row was written and what went
 * into it rather than on whether a network call happened to fail.
 */
async function submitBindsToItsLink(): Promise<void> {
  console.log('\n4. submit refuses an envelope prepared for a different link')

  const { submitClaim } = await import('../src/lib/api/claims')
  const { buildClaim, buildMaterialise } = await import('../src/lib/stellar/claim')
  const { Account, Asset, Networks, TransactionBuilder } = await import('@stellar/stellar-sdk')

  const sponsor = Keypair.fromSecret(process.env.SPONSOR_SECRET_KEY!)
  const attacker = Keypair.random()

  /** Never reaches the network — asserts on what the row becomes. */
  const accept = async (t: { hash: () => Buffer }) => ({ hash: t.hash().toString('hex'), successful: true })

  async function linkWith(tag: string) {
    const key = await makeLink()
    const row = await prisma.claimLink.findUniqueOrThrow({
      where: { ephemeralPublicKey: key },
      select: { id: true, balanceId: true },
    })
    return { tag, key, id: row.id, balanceId: row.balanceId! }
  }

  const a = await linkWith('a')
  const b = await linkWith('b')

  const tx2For = (link: { key: string; balanceId: string }) => {
    const plan = buildClaim(
      {
        sponsorAccount: new Account(sponsor.publicKey(), '100'),
        sponsorPublicKey: sponsor.publicKey(),
        ephemeralPublicKey: link.key,
        recipientPublicKey: attacker.publicKey(),
        asset: Asset.native(),
        amount: '2.5000000',
        balanceId: link.balanceId,
        networkPassphrase: Networks.TESTNET,
        baseFee: '1000',
      },
      { ephemeralExists: true, ephemeralTrusts: false, recipientExists: true, recipientTrusts: true },
    )
    const tx = TransactionBuilder.fromXDR(plan.xdr, Networks.TESTNET)
    tx.sign(sponsor)
    return tx.toXDR()
  }

  // THE ATTACK: link A's envelope, posted under link B's key.
  const crossed = await submitClaim(b.key, tx2For(a), 'claim', accept)
  check(
    "link A's envelope is refused under link B's key",
    crossed.kind === 'conflict',
    JSON.stringify(crossed).slice(0, 160),
  )

  const victim = await prisma.claimLink.findUniqueOrThrow({
    where: { id: b.id },
    select: { status: true, claimTxHash: true, claimedBy: true },
  })
  check('the victim link is untouched', victim.status === 'ACTIVE', victim.status)
  check('and carries no hash or claimant', victim.claimTxHash === null && victim.claimedBy === null)

  // The attacker's own claim must still work — the check binds, it does not block.
  const own = await submitClaim(a.key, tx2For(a), 'claim', accept)
  check("the holder's own envelope still succeeds", own.kind === 'ok', JSON.stringify(own).slice(0, 160))

  const claimed = await prisma.claimLink.findUniqueOrThrow({
    where: { id: a.id },
    select: { status: true, claimedBy: true },
  })
  check('their link is CLAIMED', claimed.status === 'CLAIMED', claimed.status)
  check(
    'and claimedBy is read from the envelope, not the request',
    claimed.claimedBy === attacker.publicKey(),
    `${claimed.claimedBy}`,
  )

  /*
   * The balance alone is not enough. An envelope can name THIS link's balance
   * while sourcing its payment and merge from another account — claiming the
   * right balance into the wrong place. Removing the op-source half of the
   * binding leaves the cross-link check above passing, so it needs its own.
   */
  const d = await linkWith('d')
  const mixed = buildClaim(
    {
      sponsorAccount: new Account(sponsor.publicKey(), '100'),
      sponsorPublicKey: sponsor.publicKey(),
      ephemeralPublicKey: a.key, // someone else's account does the spending
      recipientPublicKey: attacker.publicKey(),
      asset: Asset.native(),
      amount: '2.5000000',
      balanceId: d.balanceId, // but D's balance is named
      networkPassphrase: Networks.TESTNET,
      baseFee: '1000',
    },
    { ephemeralExists: true, ephemeralTrusts: false, recipientExists: true, recipientTrusts: true },
  )
  const mixedTx = TransactionBuilder.fromXDR(mixed.xdr, Networks.TESTNET)
  mixedTx.sign(sponsor)
  const mixedOutcome = await submitClaim(d.key, mixedTx.toXDR(), 'claim', accept)
  check(
    'an envelope naming this balance but spending another account is refused',
    mixedOutcome.kind === 'conflict',
    JSON.stringify(mixedOutcome).slice(0, 160),
  )

  // TX1 is bound by what it creates, not by a balance.
  const c = await linkWith('c')
  const tx1For = (key: string) => {
    const built = buildMaterialise(
      {
        sponsorAccount: new Account(sponsor.publicKey(), '100'),
        sponsorPublicKey: sponsor.publicKey(),
        ephemeralPublicKey: key,
        recipientPublicKey: key,
        asset: Asset.native(),
        amount: '2.5000000',
        balanceId: '00000000' + '0'.repeat(64),
        networkPassphrase: Networks.TESTNET,
        baseFee: '1000',
      },
      { ephemeralTrusts: false },
    )
    const tx = TransactionBuilder.fromXDR(built.xdr, Networks.TESTNET)
    tx.sign(sponsor)
    return tx.toXDR()
  }

  const crossedTx1 = await submitClaim(c.key, tx1For(a.key), 'materialise', accept)
  check(
    "a TX1 that creates another link's account is refused",
    crossedTx1.kind === 'conflict',
    JSON.stringify(crossedTx1).slice(0, 160),
  )

  const ownTx1 = await submitClaim(c.key, tx1For(c.key), 'materialise', accept)
  check('its own TX1 succeeds', ownTx1.kind === 'ok', JSON.stringify(ownTx1).slice(0, 160))

  // An envelope Kleym did not build at all.
  const foreign = Keypair.random()
  const rogue = new TransactionBuilder(new Account(foreign.publicKey(), '1'), {
    fee: '1000',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation((await import('@stellar/stellar-sdk')).Operation.bumpSequence({ bumpTo: '2' }))
    .setTimeout(60)
    .build()
  rogue.sign(foreign)
  const notOurs = await submitClaim(c.key, rogue.toXDR(), 'claim', accept)
  check('an envelope not sourced from the sponsor is refused', notOurs.kind === 'conflict')
}

async function main(): Promise<void> {
  try {
    await resolveIsIdentical()
    await limitsAreSeparate()
    await staleRowsAreRefused()
    await submitBindsToItsLink()
  } finally {
    await prisma.$disconnect()
    redis.disconnect()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
