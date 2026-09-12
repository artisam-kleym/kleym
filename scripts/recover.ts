/**
 * `pnpm recover` — the post-restore procedure, as code. Issue #54.
 *
 * Run against a database that has just been restored from backup. It does
 * not guess; it measures, in this order:
 *
 *   1. migrations — the restored schema must be the one this build expects;
 *   2. the audit chain — a restore that lost audit rows is visible here first;
 *   3. reconciliation — NOT a background job now but the recovery step: every
 *      link converges to what the chain says, and the critical case it
 *      refuses to auto-correct is the operator's signal;
 *   4. what a restore cannot rebuild — counted and printed, because that list
 *      is the real RPO.
 *
 * Exit 0 only when the schema is current, the chain verifies and no critical
 * finding is open. Wall-clock is printed per step: an RTO nobody measured is
 * a guess.
 */
import { spawnSync } from 'node:child_process'
import { applyEnvPlaceholders } from '../tests/env-placeholders'

applyEnvPlaceholders()
const { prisma } = await import('../src/lib/db/client')
const { verifyChain } = await import('../src/lib/api/audit-chain')
const { reconcileAll, openFindings } = await import('../src/lib/api/reconcile')
const { memoryPassCursor } = await import('../src/lib/queue/pass-cursor')
const { memoryPassReportSink } = await import('../src/lib/queue/pass-report')

const started = process.hrtime.bigint()
const stamp = () => `${(Number(process.hrtime.bigint() - started) / 1e9).toFixed(1)}s`
const log = (line: string) => console.log(`[${stamp()}] ${line}`)
let ok = true

// 1. Schema.
const status = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'status'], { encoding: 'utf8', env: process.env })
const current = /Database schema is up to date/.test(status.stdout)
log(`migrations: ${current ? 'up to date' : 'NOT current — run pnpm db:deploy before anything else'}`)
if (!current) ok = false

// 2. Audit chain.
const chain = await verifyChain()
log(`audit chain: ${chain.ok ? `ok (${chain.chained} rows, ${chain.checkpoints} checkpoints)` : `BROKEN at seq ${chain.broken?.seq}: ${chain.broken?.reason}`}`)
if (!chain.ok) ok = false

// 3. Reconciliation, as many passes as the candidate set needs, against the live ledger.
let passes = 0
let total = { linksChecked: 0, corrected: 0, critical: 0, unresolved: 0 }
const cursor = memoryPassCursor()
for (;;) {
  const report = await reconcileAll(undefined, { cursor, report: memoryPassReportSink() })
  passes += 1
  total = {
    linksChecked: total.linksChecked + report.linksChecked, corrected: total.corrected + report.corrected,
    critical: total.critical + report.critical, unresolved: total.unresolved + report.unresolved,
  }
  if (report.remaining === 0 || passes >= 200) break
}
log(`reconciliation: ${passes} pass(es), ${total.linksChecked} links checked, ${total.corrected} corrected in the chain's favour, ${total.unresolved} unresolved (re-read next run), ${total.critical} CRITICAL`)
if (total.critical > 0) {
  ok = false
  const critical = (await openFindings()).filter((f) => f.severity === 'error')
  for (const f of critical) log(`  critical: campaign ${f.campaign.id} link ${f.link.id} — ${f.detail}`)
  log('  a row says settled while the balance is on the ledger: investigate before changing any row (docs/disaster-recovery.md)')
}

// 4. What a restore cannot rebuild.
const [deliveries, unexported, sessions, apiKeys, idem] = await Promise.all([
  prisma.delivery.count({ where: { email: { not: null }, sentAt: null } }),
  prisma.campaign.count({ where: { status: 'CREATING', csvExportedAt: null } }),
  prisma.session.count(),
  prisma.apiKey.count({ where: { revokedAt: null } }),
  prisma.idempotencyKey.count(),
])
log('not rebuildable from the ledger — check against the backup\'s age:')
log(`  ${deliveries} delivery row(s) with an address but no sentAt: emails that may need re-sending`)
log(`  ${unexported} campaign(s) in CREATING without csvExportedAt: re-gated; the sender holds the CSV if they exported before the backup`)
log(`  ${sessions} session(s) restored (users signed in before the backup are still signed in; newer sessions are gone)`)
log(`  ${apiKeys} live API key(s); ${idem} idempotency record(s) — a client retrying a request from after the backup will re-execute it`)
log(`  audit rows: what the chain verified above is all there is; a signed export taken before the loss is the only other copy`)

await prisma.$disconnect()
log(ok ? 'RECOVERY CHECKS PASSED' : 'RECOVERY CHECKS FAILED — see above')
process.exit(ok ? 0 : 1)
