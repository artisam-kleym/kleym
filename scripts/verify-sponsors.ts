/**
 * Verification for the sponsor pool, failover and alerting (#48). Real
 * Postgres and Redis; Horizon stubbed; a real HTTP receiver for the webhook.
 *
 * The pool is two throwaway keys set BEFORE env is read. Criteria 1–5:
 * failover for a new campaign, in-flight campaigns keep their sponsor (the
 * envelope check and the signing key both follow the binding), the alert
 * webhook fires against a real receiver and deduplicates, /admin's per-sponsor
 * figures and runway, and no pool secret reaches a log line.
 *
 * Run: pnpm verify:sponsors
 */
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Account, Asset, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

// A pool of two, and a real receiver, before the env is validated.
const primary = Keypair.random()
const second = Keypair.random()
const received: { headers: Record<string, string | string[] | undefined>; body: unknown }[] = []
const receiver = createServer((req, res) => {
  let data = ''
  req.on('data', (c) => (data += c))
  req.on('end', () => {
    received.push({ headers: req.headers, body: JSON.parse(data) })
    res.writeHead(202).end()
  })
})
await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', r))
const port = (receiver.address() as { port: number }).port
process.env.SPONSOR_PUBLIC_KEY = primary.publicKey()
process.env.SPONSOR_SECRET_KEY = primary.secret()
process.env.SPONSOR_SECRET_KEYS_EXTRA = ` ${second.secret()} `
process.env.SPONSOR_WORKING_THRESHOLD = '50'
process.env.SPONSOR_MIN_BALANCE_ALERT = '100'
process.env.ALERT_WEBHOOK_URL = `http://127.0.0.1:${port}/alerts?token=hook-secret-token`
applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { redis } = await import('../src/lib/redis/client')
const { logger } = await import('../src/lib/config/logger')
const { sponsorPool, sponsorFor, sponsorSecret, chooseSponsor, runwayDays, feePerClaim } = await import('../src/lib/stellar/sponsors')
const { sponsorStatuses } = await import('../src/lib/api/sponsor-status')
const { alert } = await import('../src/lib/alerts')
const { loadClaimable, submitClaim } = await import('../src/lib/api/claims')
const { buildClaim } = await import('../src/lib/stellar/claim')

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const captured: string[] = []
const originalWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
  captured.push(String(chunk))
  return (originalWrite as (c: string | Uint8Array, ...r: unknown[]) => boolean)(chunk, ...rest)
}) as typeof process.stdout.write

const balances = new Map<string, Decimal>()
const read = async (pk: string) => {
  const v = balances.get(pk)
  if (v === undefined) throw new Error('unreadable')
  return v
}

function thePool(): void {
  console.log('\n· The pool is the primary plus the extras, secrets never on the public shape')
  const pool = sponsorPool()
  check('two sponsors, primary first', pool.length === 2 && pool[0]!.publicKey === primary.publicKey() && pool[1]!.publicKey === second.publicKey())
  check('the public shape carries no secret', !/S[A-Z2-7]{55}/.test(JSON.stringify(pool)) && !('secret' in pool[0]!))
  check('a null binding reads as the primary', sponsorFor(null)?.publicKey === primary.publicKey())
  check('an unknown binding is null — refused, not defaulted to another sponsor', sponsorFor(Keypair.random().publicKey()) === null)
  check('the signing seed is looked up by public key', sponsorSecret(second.publicKey()) === second.secret())
}

async function failoverForNewCampaigns(): Promise<void> {
  console.log('\n1. With the primary below the working threshold, a new campaign goes to the second sponsor')
  balances.set(primary.publicKey(), new Decimal(20))
  balances.set(second.publicKey(), new Decimal(500))
  await redis.del(`alert:sponsor.failover:*`)
  const before = received.length
  const choice = await chooseSponsor(read)
  check('the second sponsor is chosen', choice.sponsor.publicKey === second.publicKey() && choice.failedOver, JSON.stringify(choice))
  await new Promise((r) => setTimeout(r, 200))
  check('a failover alert reached the webhook', received.length === before + 1 && (received[received.length - 1]!.body as { event: string }).event === 'sponsor.failover', `${received.length - before} received`)

  balances.set(primary.publicKey(), new Decimal(80))
  const healthy = await chooseSponsor(read)
  check('with the primary back above threshold it is chosen again', healthy.sponsor.publicKey === primary.publicKey() && !healthy.failedOver)

  balances.set(primary.publicKey(), new Decimal(10))
  balances.set(second.publicKey(), new Decimal(30))
  const best = await chooseSponsor(read)
  check('with every sponsor below threshold the richest is chosen', best.sponsor.publicKey === second.publicKey())

  balances.delete(second.publicKey())
  balances.set(primary.publicKey(), new Decimal(1000))
  const skipped = await chooseSponsor(read)
  check('an unreadable sponsor is skipped, not treated as empty', skipped.sponsor.publicKey === primary.publicKey())

  // Horizon down entirely: campaign creation still works, bound to the primary.
  balances.clear()
  const blind = await chooseSponsor(read)
  check('with no sponsor readable, a new campaign binds to the primary rather than failing', blind.sponsor.publicKey === primary.publicKey() && !blind.failedOver, JSON.stringify(blind))
}

async function inFlightCampaignsKeepTheirSponsor(): Promise<void> {
  console.log('\n2. A campaign stays with its sponsor: the claim path reads the binding, and an envelope from another sponsor is refused')
  const user = await prisma.user.create({ data: { username: `sp-${randomUUID().slice(0, 8)}`, passwordHash: 'x', role: 'SENDER' }, select: { id: true } })
  const orgId = await personalOrg(prisma, user.id)
  const mk = async (sponsorPublicKey: string | null) => {
    const c = await prisma.campaign.create({
      data: {
        userId: user.id, organizationId: orgId, sponsorPublicKey, name: 'sp', network: 'testnet', senderPublicKey: Keypair.random().publicKey(),
        assetCode: 'XLM', amountPerLink: '2.5000000', linkCount: 1, expiresAt: new Date(Date.now() + 86_400_000), status: 'ACTIVE',
      },
      select: { id: true },
    })
    const key = Keypair.random().publicKey()
    const balanceId = `00000000${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`.slice(0, 72)
    await prisma.claimLink.create({ data: { campaignId: c.id, ephemeralPublicKey: key, status: 'ACTIVE', balanceId } })
    return { key, balanceId }
  }
  const onSecond = await mk(second.publicKey())
  const legacy = await mk(null)
  const present = async (id: string) => ({ id, asset: 'native', amount: '2.5000000', claimants: [] })

  const loadedSecond = await loadClaimable(onSecond.key, present)
  check('a campaign bound to the second sponsor loads with that sponsor', loadedSecond.kind === 'ok' && loadedSecond.value.sponsorPublicKey === second.publicKey(), JSON.stringify(loadedSecond).slice(0, 120))
  const loadedLegacy = await loadClaimable(legacy.key, present)
  check('a pre-pool campaign (null) loads as the primary', loadedLegacy.kind === 'ok' && loadedLegacy.value.sponsorPublicKey === primary.publicKey())

  // Even after "failover", the second-sponsor campaign's envelope must be
  // sourced by the second sponsor; one built for the primary is not Kleym's.
  const accept = async (t: { hash: () => Buffer }) => ({ hash: t.hash().toString('hex'), successful: true })
  const envelopeFrom = (sponsor: Keypair) => {
    const plan = buildClaim(
      {
        sponsorAccount: new Account(sponsor.publicKey(), '100'), sponsorPublicKey: sponsor.publicKey(),
        ephemeralPublicKey: onSecond.key, recipientPublicKey: Keypair.random().publicKey(), asset: Asset.native(),
        amount: '2.5000000', balanceId: onSecond.balanceId, networkPassphrase: Networks.TESTNET, baseFee: '1000',
      },
      { ephemeralExists: true, ephemeralTrusts: false, recipientExists: true, recipientTrusts: true },
    )
    const tx = TransactionBuilder.fromXDR(plan.xdr, Networks.TESTNET)
    tx.sign(sponsor)
    return tx.toXDR()
  }
  const wrong = await submitClaim(onSecond.key, envelopeFrom(primary), 'claim', accept)
  check("an envelope sourced by the PRIMARY is refused for a campaign bound to the second", wrong.kind === 'conflict' && /not prepared by Kleym/.test(wrong.detail), JSON.stringify(wrong))
  const right = await submitClaim(onSecond.key, envelopeFrom(second), 'claim', accept)
  check('the bound sponsor\'s envelope is accepted', right.kind === 'ok', JSON.stringify(right).slice(0, 120))

  // A runbook slip: a campaign bound to a sponsor that has left the pool.
  const orphan = await mk(Keypair.random().publicKey())
  const loadedOrphan = await loadClaimable(orphan.key, present)
  check('a campaign bound to a sponsor not in the pool is "temporarily unavailable", not an exception', loadedOrphan.kind === 'unavailable', JSON.stringify(loadedOrphan))
  const submittedOrphan = await submitClaim(orphan.key, envelopeFrom(primary), 'claim', accept)
  check('and its submit is refused the same way', submittedOrphan.kind === 'unavailable', JSON.stringify(submittedOrphan))
}

async function alertsReachAReceiverAndDeduplicate(): Promise<void> {
  console.log('\n3. The low-balance alert fires against a real receiver and deduplicates for an hour')
  const key = `dedupe-${randomUUID().slice(0, 6)}`
  const before = received.length
  const first = await alert('sponsor.low_balance', { sponsor: key, spendable: '5', threshold: 100 }, { dedupeKey: key })
  const again = await alert('sponsor.low_balance', { sponsor: key, spendable: '4', threshold: 100 }, { dedupeKey: key })
  await new Promise((r) => setTimeout(r, 200))
  check('the first alert is delivered', first.sent && received.length === before + 1, JSON.stringify(first))
  check('with the event in a header and a JSON body naming the sponsor', received[received.length - 1]!.headers['x-kleym-alert'] === 'sponsor.low_balance' && (received[received.length - 1]!.body as { sponsor: string }).sponsor === key)
  check('the second within the hour is deduplicated, not sent', again.deduplicated && !again.sent && received.length === before + 1)
  const other = await alert('sponsor.low_balance', { sponsor: `${key}-b`, spendable: '5', threshold: 100 }, { dedupeKey: `${key}-b` })
  check('a different sponsor is its own alert', other.sent)

  const failing = await alert('sponsor.failover', { chosen: 'x' }, { dedupeKey: randomUUID(), fetchImpl: async () => { throw new Error('receiver down') } })
  check('an unreachable receiver does not throw — the claim goes on', !failing.sent && !failing.deduplicated)
}

async function adminFigures(): Promise<void> {
  console.log('\n4. Per-sponsor float and runway for /admin')
  balances.set(primary.publicKey(), new Decimal(1000))
  balances.set(second.publicKey(), new Decimal(50))
  const statuses = await sponsorStatuses(read)
  check('one row per sponsor, primary first', statuses.length === 2 && statuses[0]!.index === 0 && statuses[0]!.spendable === '1000')
  check('the second is flagged low against the alert threshold', statuses[1]!.low === true && statuses[1]!.spendable === '50')
  check('fee per claim is 30 ops at the base fee', feePerClaim(1000).toFixed() === '0.003')
  check('runway = spendable / (claims per day × fee per claim), rounded down', runwayDays(new Decimal(1000), new Decimal(100), 1000)?.toFixed() === '3333')
  check('no claims means no runway figure, not infinity', runwayDays(new Decimal(1000), new Decimal(0), 1000) === null)
  check('the status carries the rate and runway as strings for the page', statuses.every((s) => typeof s.claimsPerDay === 'string'))
}

function secretsNeverLog(): void {
  console.log('\n5. No pool secret reaches a log line')
  logger.info({ SPONSOR_SECRET_KEYS_EXTRA: process.env.SPONSOR_SECRET_KEYS_EXTRA, ALERT_WEBHOOK_URL: process.env.ALERT_WEBHOOK_URL, nested: { SPONSOR_SECRET_KEY: primary.secret() } }, 'planted secrets')
  logger.info({ env: { SPONSOR_SECRET_KEYS_EXTRA: second.secret() } }, 'planted env')
  const joined = captured.join('\n')
  check('the extra pool seed is redacted', !joined.includes(second.secret()))
  check('the primary seed is redacted', !joined.includes(primary.secret()))
  check('the webhook URL (which may carry a token) is redacted', !joined.includes('hook-secret-token'))
}

async function main(): Promise<void> {
  try {
    thePool()
    await failoverForNewCampaigns()
    await inFlightCampaignsKeepTheirSponsor()
    await alertsReachAReceiverAndDeduplicate()
    await adminFigures()
    secretsNeverLog()
  } finally {
    await prisma.$disconnect()
    await redis.quit().catch(() => undefined)
    receiver.close()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
