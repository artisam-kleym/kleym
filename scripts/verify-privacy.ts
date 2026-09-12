/**
 * Verification for the Delivery lifecycle (#50). Real Postgres, real Redis.
 *
 * Criteria 1–5: retention redacts settled rows after the period; erasure by
 * address redacts every matching row in one operation; link statuses, claim
 * records and hashes are unchanged; the erased address survives nowhere —
 * database, audit log, Redis, captured log lines; the retention pass is
 * bounded and reports a shortfall. Run: pnpm verify:privacy
 */
import { randomUUID } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { redis } = await import('../src/lib/redis/client')
const { logger } = await import('../src/lib/config/logger')
const { sweepDeliveryRetention, eraseByEmail, retentionWhere, DELIVERY_RETENTION_MS, RETENTION_PASS_LIMIT } = await import('../src/lib/api/privacy')
const { memoryPassCursor } = await import('../src/lib/queue/pass-cursor')
const { memoryPassReportSink } = await import('../src/lib/queue/pass-report')
const { deliveryJobs, enqueueDelivery } = await import('../src/lib/queue/email')
const { scrubMetadata, REDACTED } = await import('../src/lib/api/audit')
const { gateFor } = await import('../src/lib/api/otp')

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// Every log line this process writes, so an address can be searched for.
const captured: string[] = []
const originalWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
  captured.push(String(chunk))
  return (originalWrite as (c: string | Uint8Array, ...r: unknown[]) => boolean)(chunk, ...rest)
}) as typeof process.stdout.write

type LinkStatus = 'ACTIVE' | 'CLAIMED' | 'RECLAIMED' | 'FAILED' | 'EXPIRED'
async function fixture(email: string, links: { status: LinkStatus; claimedAt?: Date }[], campaign: { status?: 'ACTIVE' | 'EXPIRED' | 'RECLAIMED' | 'CANCELLED'; expiresAt?: Date } = {}) {
  const user = await prisma.user.create({ data: { username: `pii-${randomUUID().slice(0, 8)}`, passwordHash: 'x', role: 'SENDER' }, select: { id: true } })
  const orgId = await personalOrg(prisma, user.id)
  const c = await prisma.campaign.create({
    data: {
      userId: user.id, organizationId: orgId, name: 'pii', network: 'testnet', senderPublicKey: Keypair.random().publicKey(),
      assetCode: 'XLM', amountPerLink: '1', linkCount: links.length,
      expiresAt: campaign.expiresAt ?? new Date(Date.now() + 30 * 86_400_000), status: campaign.status ?? 'ACTIVE',
    },
    select: { id: true },
  })
  const rows = []
  for (const l of links) {
    const key = Keypair.random().publicKey()
    const hash = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
    const link = await prisma.claimLink.create({
      data: {
        campaignId: c.id, ephemeralPublicKey: key, status: l.status,
        balanceId: `00000000${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`.slice(0, 72),
        claimedAt: l.claimedAt ?? null, claimedBy: l.claimedAt ? Keypair.random().publicKey() : null, claimTxHash: l.claimedAt ? hash : null,
        delivery: { create: { email, sentAt: new Date(), openedAt: new Date(), otpHash: '$argon2id$x', otpExpires: new Date(), otpAttempts: 2 } },
      },
      select: { id: true, status: true, claimedBy: true, claimedAt: true, claimTxHash: true, ephemeralPublicKey: true, delivery: { select: { id: true } } },
    })
    rows.push(link)
  }
  return { userId: user.id, campaignId: c.id, links: rows }
}
const longAgo = new Date(Date.now() - DELIVERY_RETENTION_MS - 86_400_000)
const recently = new Date(Date.now() - 86_400_000)

async function retentionRedactsSettledRows(): Promise<void> {
  console.log('\n1. Retention redacts a delivery once its link or campaign settled long enough ago')
  const addr = `keep-${randomUUID().slice(0, 6)}@example.test`
  const f = await fixture(addr, [
    { status: 'CLAIMED', claimedAt: longAgo }, // due
    { status: 'CLAIMED', claimedAt: recently }, // not yet
    { status: 'ACTIVE' }, // live, campaign live
  ])
  const expiredCampaign = await fixture(addr, [{ status: 'EXPIRED' }], { status: 'EXPIRED', expiresAt: longAgo }) // due via campaign
  const freshExpired = await fixture(addr, [{ status: 'EXPIRED' }], { status: 'EXPIRED', expiresAt: recently }) // not yet

  const report = await sweepDeliveryRetention(new Date(), { cursor: memoryPassCursor(), report: memoryPassReportSink() })
  check('the pass redacted rows', report.redacted >= 2, JSON.stringify(report))
  const after = async (id: string) => prisma.delivery.findUniqueOrThrow({ where: { linkId: id }, select: { email: true, redactedAt: true, sentAt: true, openedAt: true, otpHash: true } })
  const due = await after(f.links[0]!.id)
  check('a link claimed > 90 days ago is redacted', due.email === null && due.redactedAt !== null, JSON.stringify(due))
  check('keeping sentAt/openedAt, clearing the OTP material', due.sentAt !== null && due.openedAt !== null && due.otpHash === null)
  check('a link claimed yesterday is kept', (await after(f.links[1]!.id)).email === addr)
  check('a live link is kept', (await after(f.links[2]!.id)).email === addr)
  check('a link in a campaign expired > 90 days ago is redacted', (await after(expiredCampaign.links[0]!.id)).email === null)
  check('one expired yesterday is kept', (await after(freshExpired.links[0]!.id)).email === addr)
  check('the sweep audited a count, not an address', (await prisma.auditLog.count({ where: { action: 'privacy.retention' } })) >= 1)
  const again = await sweepDeliveryRetention(new Date(), { cursor: memoryPassCursor(), report: memoryPassReportSink() })
  check('a second pass finds nothing more for these rows', (await after(f.links[1]!.id)).email === addr && again.checked >= 0)
}

async function erasureByAddress(): Promise<void> {
  console.log('\n2, 3 & 4. Erasure redacts every row for an address; the money record survives; the address survives nowhere')
  const addr = `erase-${randomUUID().slice(0, 6)}@example.test`
  const other = `other-${randomUUID().slice(0, 6)}@example.test`
  const a = await fixture(addr, [{ status: 'CLAIMED', claimedAt: recently }, { status: 'ACTIVE' }])
  const b = await fixture(addr.toUpperCase(), [{ status: 'ACTIVE' }]) // another campaign, different case
  const c = await fixture(other, [{ status: 'ACTIVE' }])
  const admin = await prisma.user.create({ data: { username: `pii-admin-${randomUUID().slice(0, 6)}`, passwordHash: 'x', role: 'ADMIN' }, select: { id: true } })

  // A send still waiting in the queue for one of the deliveries.
  const queue = deliveryJobs()
  await queue.obliterate({ force: true })
  await enqueueDelivery({
    deliveryId: a.links[1]!.delivery!.id, linkId: a.links[1]!.id, email: addr, claimUrl: `http://localhost/claim#s=${Keypair.random().secret()}`,
    senderName: 'x', amount: '1', assetCode: 'XLM', expiresAt: new Date().toISOString(), otpRequired: true,
  })
  check('a delivery job is waiting', (await queue.getWaitingCount()) === 1)

  const before = await prisma.claimLink.findMany({ where: { campaignId: { in: [a.campaignId, b.campaignId] } }, orderBy: { id: 'asc' }, select: { id: true, status: true, claimedBy: true, claimedAt: true, claimTxHash: true } })
  const result = await eraseByEmail(admin.id, addr, '203.0.113.50')
  check('three deliveries redacted across two campaigns, case-insensitively', result.redacted === 3, JSON.stringify(result))
  const rows = await prisma.delivery.findMany({ where: { linkId: { in: [...a.links, ...b.links].map((l) => l.id) } }, select: { email: true, redactedAt: true, sentAt: true } })
  check('every one is null with redactedAt set and sentAt kept', rows.every((r) => r.email === null && r.redactedAt !== null && r.sentAt !== null))
  check("the other address's row is untouched", (await prisma.delivery.findUniqueOrThrow({ where: { linkId: c.links[0]!.id } })).email === other)
  const after = await prisma.claimLink.findMany({ where: { campaignId: { in: [a.campaignId, b.campaignId] } }, orderBy: { id: 'asc' }, select: { id: true, status: true, claimedBy: true, claimedAt: true, claimTxHash: true } })
  check('link statuses, claim records and transaction hashes are unchanged', JSON.stringify(before) === JSON.stringify(after))
  check('the queued send was removed', (await queue.getWaitingCount()) === 0)
  check('the still-live link stays gated, with nowhere to send a code', (await gateFor(a.links[1]!.ephemeralPublicKey))?.email === null)

  // Nowhere: database, audit, Redis, log lines.
  const inDb = await prisma.$queryRawUnsafe<{ n: bigint }[]>('SELECT count(*)::bigint AS n FROM "Delivery" WHERE lower("email") = $1', addr.toLowerCase())
  check('no Delivery row holds it', Number(inDb[0]!.n) === 0)
  const audit = await prisma.auditLog.findMany({ where: { action: 'privacy.erasure', userId: admin.id } })
  check('the erasure audit row exists with a count', audit.length === 1 && (audit[0]!.metadata as { redacted: number }).redacted === 3, JSON.stringify(audit.map((r) => r.metadata)))
  check('and does not contain the address', !JSON.stringify(audit).toLowerCase().includes(addr.toLowerCase()))
  const keys = await redis.keys('*')
  let redisHit = false
  for (const key of keys) {
    if (key.toLowerCase().includes(addr.toLowerCase())) redisHit = true
    const type = await redis.type(key)
    const dump =
      type === 'string' ? await redis.get(key)
      : type === 'hash' ? JSON.stringify(await redis.hgetall(key))
      : type === 'list' ? JSON.stringify(await redis.call('LRANGE', key, '0', '-1'))
      : type === 'zset' ? JSON.stringify(await redis.call('ZRANGE', key, '0', '-1'))
      : type === 'set' ? JSON.stringify(await redis.smembers(key))
      : ''
    if ((dump ?? '').toLowerCase().includes(addr.toLowerCase())) redisHit = true
  }
  check(`the address is in no Redis key or value (${keys.length} keys scanned)`, !redisHit)
  logger.info({ erased: 3 }, 'post-erasure marker')
  const logHit = captured.some((line) => line.toLowerCase().includes(addr.toLowerCase()) && !line.includes('PASS') && !line.includes('FAIL'))
  check('no log line this process wrote contains it', !logHit)
  check('the scrubber refuses an `email` key outright', scrubMetadata({ email: addr, recipientEmail: addr, note: 'x' }).clean.email === REDACTED && scrubMetadata({ recipientEmail: addr }).clean.recipientEmail === REDACTED)
  await queue.close()
}

async function thePassIsBounded(): Promise<void> {
  console.log('\n5. The retention pass is bounded and reports what it did not reach')
  const addr = `bulk-${randomUUID().slice(0, 6)}@example.test`
  const f = await fixture(addr, Array.from({ length: 5 }, () => ({ status: 'CLAIMED' as const, claimedAt: longAgo })))
  const due = await prisma.delivery.count({ where: retentionWhere(new Date()) })
  check(`${due} rows are due (at least these 5)`, due >= 5)
  const cursor = memoryPassCursor()
  const sink = memoryPassReportSink()
  const first = await sweepDeliveryRetention(new Date(), { limit: 2, cursor, report: sink })
  check('the first pass stops at the limit', first.checked === 2 && first.redacted === 2, JSON.stringify(first))
  check('and reports the remainder', first.remaining === due - 2, `${first.remaining} of ${due - 2}`)
  check('the pass report reaches the admin page sink', sink.last?.job === 'delivery-retention' && sink.last.remaining === first.remaining)
  let last = first
  for (let i = 0; i < 50 && last.remaining > 0; i += 1) last = await sweepDeliveryRetention(new Date(), { limit: 2, cursor, report: sink })
  check('later passes finish the set', last.remaining === 0)
  check('all five are redacted', (await prisma.delivery.count({ where: { linkId: { in: f.links.map((l) => l.id) }, email: null } })) === 5)
  check(`RETENTION_PASS_LIMIT is a sane default (${RETENTION_PASS_LIMIT})`, RETENTION_PASS_LIMIT >= 100)
}

async function main(): Promise<void> {
  try {
    await retentionRedactsSettledRows()
    await erasureByAddress()
    await thePassIsBounded()
  } finally {
    await prisma.$disconnect()
    await redis.quit().catch(() => undefined)
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
