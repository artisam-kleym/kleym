/**
 * Verification for the tamper-evident audit log (#49). Real Postgres.
 *
 * 1. Modifying, inserting or deleting a row breaks verification at the
 *    first broken link. Edits go in with the maintenance flag set — the
 *    only way past the trigger — which is exactly what a database admin
 *    with the same access could do.
 * 2. Verification passes across a retention checkpoint.
 * 3. Concurrent writes make one unbroken chain.
 * 4. An export verifies with the public key alone, and a tampered copy does not.
 * 5. The application role cannot UPDATE or DELETE audit rows.
 * 6. Retention deletion is itself audited; the scrubber still runs.
 *
 * Run: pnpm verify:audit-chain
 */
import { randomUUID } from 'node:crypto'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { Prisma } from '../src/generated/prisma/client'
import { applyEnvPlaceholders } from '../tests/env-placeholders'

applyEnvPlaceholders()
// Seqs are BigInt; the detail strings below JSON them.
;(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () { return this.toString() }

const { prisma } = await import('../src/lib/db/client')
const { recordAudit, REDACTED } = await import('../src/lib/api/audit')
const { verifyChain, retainAudit, buildExport, exportRows, verifyBytes, CHECKPOINT_ACTION, canonicalJson } = await import('../src/lib/api/audit-chain')

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** An edit a DBA could make: inside a transaction that sets the maintenance flag. */
async function asMaintenance(sql: Prisma.Sql): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SET LOCAL kleym.audit_maintenance = 'on'`)
    await tx.$executeRaw(sql)
  })
}
async function undoMaintenance(sql: Prisma.Sql): Promise<void> {
  await asMaintenance(sql)
}
async function actor() {
  return (await prisma.user.create({ data: { username: `chain-${randomUUID().slice(0, 8)}`, passwordHash: 'x', role: 'SENDER' }, select: { id: true } })).id
}
async function write(userId: string, n: number, organizationId: string | null = null) {
  for (let i = 0; i < n; i += 1) await recordAudit({ userId, organizationId, action: 'campaign.create', entityType: 'campaign', entityId: `c_${randomUUID().slice(0, 6)}`, metadata: { i }, ip: '203.0.113.1' })
}

async function tamperingIsDetected(): Promise<void> {
  console.log('\n1. Modify, insert, delete — each breaks the chain at the first bad link')
  const u = await actor()
  await write(u, 5)
  const clean = await verifyChain()
  check('the chain verifies before anything is touched', clean.ok, JSON.stringify(clean.broken))
  const rows = await prisma.auditLog.findMany({ where: { userId: u }, orderBy: { seq: 'asc' }, select: { id: true, seq: true, metadata: true, action: true } })
  const victim = rows[2]!

  // Modify.
  await asMaintenance(Prisma.sql`UPDATE "AuditLog" SET "action" = 'campaign.cancel' WHERE "id" = ${victim.id}`)
  let v = await verifyChain()
  check('a modified row is detected', !v.ok && v.broken?.seq === victim.seq && /contents changed/.test(v.broken.reason), JSON.stringify(v.broken))
  await undoMaintenance(Prisma.sql`UPDATE "AuditLog" SET "action" = ${victim.action} WHERE "id" = ${victim.id}`)
  check('and restoring it heals the chain', (await verifyChain()).ok)

  // Insert (an unchained row, the only kind a direct INSERT can make).
  await prisma.auditLog.create({ data: { id: `planted_${randomUUID().slice(0, 6)}`, action: 'campaign.create', userId: u } })
  v = await verifyChain()
  check('an inserted row is detected', !v.ok && v.unchained === 1 && /outside recordAudit/.test(v.broken?.reason ?? ''), JSON.stringify(v.broken))
  await asMaintenance(Prisma.sql`DELETE FROM "AuditLog" WHERE "seq" IS NULL`)
  check('removing it heals the chain', (await verifyChain()).ok)

  // Tail tampering: the last row goes, and the head no longer matches.
  const last = await prisma.auditLog.findFirst({ where: { seq: { not: null } }, orderBy: { seq: 'desc' }, select: { id: true, seq: true } })
  await asMaintenance(Prisma.sql`DELETE FROM "AuditLog" WHERE "id" = ${last!.id}`)
  v = await verifyChain()
  check('removing the last row is detected against the head', !v.ok && /head does not match/.test(v.broken?.reason ?? ''), JSON.stringify(v.broken))
  // Put the head back on the real tail so the next tampering is the only break.
  const tail = await prisma.auditLog.findFirst({ where: { seq: { not: null } }, orderBy: { seq: 'desc' }, select: { seq: true, rowHash: true } })
  await prisma.auditChainHead.update({ where: { id: 1 }, data: { seq: tail!.seq!, rowHash: tail!.rowHash! } })
  check('(head realigned; chain verifies again)', (await verifyChain()).ok)

  // A mid-chain delete, then a forged replacement at the same seq.
  await asMaintenance(Prisma.sql`DELETE FROM "AuditLog" WHERE "id" = ${victim.id}`)
  v = await verifyChain()
  check('a deleted row is detected as a gap', !v.ok && v.broken?.seq === victim.seq! + 1n && /removed without a checkpoint/.test(v.broken.reason), JSON.stringify(v.broken))
  await asMaintenance(Prisma.sql`INSERT INTO "AuditLog" ("id","seq","prevHash","rowHash","canonVersion","userId","action","createdAt") VALUES (${`forged_${randomUUID().slice(0, 6)}`}, ${victim.seq}, 'x', 'y', 1, ${u}, 'campaign.create', now())`)
  v = await verifyChain()
  check('a forged replacement at the same seq is detected', !v.ok && v.broken?.seq === victim.seq, JSON.stringify(v.broken))
  await asMaintenance(Prisma.sql`DELETE FROM "AuditLog" WHERE "seq" = ${victim.seq}`)

}

async function retentionCheckpoint(): Promise<void> {
  console.log('\n2 & 6. Retention removes a prefix, writes a chained checkpoint, and verification passes across it')
  // Repair round 1's mid-chain gap the only legitimate way: retain everything up to and past it.
  const u = await actor()
  await write(u, 4)
  const before = await verifyChain()
  check('(the gap from round 1 is still there)', !before.ok)
  const oldest = await prisma.auditLog.findFirst({ where: { seq: { not: null } }, orderBy: { seq: 'asc' }, select: { seq: true } })
  // A cutoff past every row there could be (other verify scripts plant rows
  // dated 2031 for their own reasons), so the whole chain is the prefix
  // removed and the checkpoint becomes the first row — the heaviest case.
  const result = await retainAudit(new Date('2040-01-01T00:00:00Z'), 0)
  check('retention removed the prefix', result.removed > 0 && result.fromSeq === oldest!.seq, JSON.stringify({ ...result, fromSeq: String(result.fromSeq), toSeq: String(result.toSeq) }))
  const cp = await prisma.auditLog.findFirst({ where: { action: CHECKPOINT_ACTION }, orderBy: { seq: 'desc' } })
  check('a checkpoint row was written, chained, naming what was removed', cp !== null && cp.seq !== null && (cp.metadata as { removed: number }).removed === result.removed && (cp.metadata as { toSeq: string }).toSeq === String(result.toSeq))
  const after = await verifyChain()
  check('verification passes across the checkpoint', after.ok && after.checkpoints >= 1, JSON.stringify(after.broken))
  check('the removed rows are gone', (await prisma.auditLog.count({ where: { seq: { lte: result.toSeq! } } })) === 0)
  await write(u, 2)
  check('and writing after the checkpoint keeps it passing', (await verifyChain()).ok)

  const chk = (await prisma.auditLog.findFirst({ where: { action: CHECKPOINT_ACTION }, orderBy: { seq: 'desc' } }))!
  await asMaintenance(Prisma.sql`UPDATE "AuditLog" SET "metadata" = jsonb_set("metadata", '{removed}', '1') WHERE "id" = ${chk.id}`)
  check('a tampered checkpoint is detected like any row', !(await verifyChain()).ok)
  await asMaintenance(Prisma.sql`UPDATE "AuditLog" SET "metadata" = ${JSON.stringify(chk.metadata)}::jsonb WHERE "id" = ${chk.id}`)
  check('(restored)', (await verifyChain()).ok)
}

async function concurrentWritesDoNotFork(): Promise<void> {
  console.log('\n3. Sixty concurrent writes make one unbroken chain')
  const u = await actor()
  const head = await prisma.auditChainHead.findUniqueOrThrow({ where: { id: 1 } })
  await Promise.all(Array.from({ length: 60 }, (_, i) => recordAudit({ userId: u, action: 'apikey.create', entityType: 'apikey', entityId: `k${i}`, ip: null })))
  const written = await prisma.auditLog.findMany({ where: { userId: u }, orderBy: { seq: 'asc' }, select: { seq: true, prevHash: true, rowHash: true } })
  check('all sixty landed with a seq', written.length === 60 && written.every((r) => r.seq !== null))
  const seqs = written.map((r) => r.seq!)
  check('seqs are contiguous from the previous head', seqs[0] === head.seq + 1n && seqs.every((s, i) => i === 0 || s === seqs[i - 1]! + 1n))
  check('each prevHash is the previous rowHash', written.every((r, i) => i === 0 || r.prevHash === written[i - 1]!.rowHash))
  check('the chain verifies', (await verifyChain()).ok)
}

async function signedExportVerifiesAlone(): Promise<void> {
  console.log('\n4. A signed export verifies with the public key alone; a tampered copy does not')
  const u = await actor()
  const org = await prisma.organization.create({ data: { name: 'exp', memberships: { create: { userId: u, role: 'OWNER' } } }, select: { id: true } })
  await write(u, 3, org.id)
  const rows = await exportRows({ organizationId: org.id })
  check('the export is scoped to the organisation', rows.length === 3 && rows.every((r) => r.organizationId === org.id))
  const json = buildExport(rows, { organizationId: org.id }, 'json')
  const csv = buildExport(rows, { organizationId: org.id }, 'csv')
  check('json and csv are both signed', verifyBytes(json.body, json.signature, json.publicKey) && verifyBytes(csv.body, csv.signature, csv.publicKey))
  const flipped = Buffer.from(json.body)
  flipped[flipped.length - 5] ^= 0x01
  check('one flipped byte fails signature verification', !verifyBytes(flipped, json.signature, json.publicKey))

  // The auditor's path: a file, a signature, a public key, no database.
  const dir = mkdtempSync(join(tmpdir(), 'kleym-audit-'))
  const file = join(dir, 'export.json')
  writeFileSync(file, json.body)
  const ok = spawnSync('pnpm', ['exec', 'tsx', 'scripts/audit-verify-export.ts', file, json.signature, json.publicKey], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://nobody@127.0.0.1:1/none' } })
  check('the CLI verifies it with the public key alone', ok.status === 0 && /signature: VALID/.test(ok.stdout) && /row hashes: VALID/.test(ok.stdout), ok.stdout + ok.stderr)
  const doc = JSON.parse(json.body.toString()) as { rows: { action: string }[] }
  doc.rows[0]!.action = 'campaign.cancel'
  const edited = join(dir, 'edited.json')
  writeFileSync(edited, canonicalJson(doc))
  const bad = spawnSync('pnpm', ['exec', 'tsx', 'scripts/audit-verify-export.ts', edited, json.signature, json.publicKey], { encoding: 'utf8' })
  check('an edited file fails both the signature and the row hashes', bad.status !== 0 && /signature: INVALID/.test(bad.stdout) && /row hashes: INVALID/.test(bad.stdout), bad.stdout)
}

async function appendOnlyAtTheDatabase(): Promise<void> {
  console.log('\n5. The application connection cannot UPDATE or DELETE audit rows')
  const row = await prisma.auditLog.findFirstOrThrow({ where: { seq: { not: null } }, select: { id: true } })
  let refused = 0
  try { await prisma.auditLog.update({ where: { id: row.id }, data: { ip: '1.1.1.1' } }) } catch (e) { if (/append-only/.test(String((e as { message?: string }).message ?? e))) refused += 1 }
  try { await prisma.auditLog.delete({ where: { id: row.id } }) } catch (e) { if (/append-only/.test(String((e as { message?: string }).message ?? e))) refused += 1 }
  try { await prisma.$executeRaw(Prisma.sql`UPDATE "AuditLog" SET "ip" = '2.2.2.2' WHERE "id" = ${row.id}`) } catch (e) { if (/append-only/.test(String((e as { message?: string }).message ?? e))) refused += 1 }
  check('UPDATE via Prisma, DELETE via Prisma and raw UPDATE are all refused by the trigger', refused === 3, `${refused} of 3`)
  check('the row is untouched', (await prisma.auditLog.findUniqueOrThrow({ where: { id: row.id } })).ip !== '1.1.1.1')
}

async function scrubberStillRuns(): Promise<void> {
  console.log('\n· The scrubber still runs on every chained write')
  const u = await actor()
  await recordAudit({ userId: u, action: 'apikey.create', entityType: 'apikey', entityId: 'k', metadata: { name: 'ok', token: 'sk_live_xyz' }, ip: null })
  const row = await prisma.auditLog.findFirstOrThrow({ where: { userId: u }, select: { metadata: true } })
  check('the credential is redacted before hashing', (row.metadata as { token: string }).token === REDACTED)
  check('and the chain still verifies', (await verifyChain()).ok)
}

async function main(): Promise<void> {
  try {
    await tamperingIsDetected()
    await retentionCheckpoint()
    await concurrentWritesDoNotFork()
    await signedExportVerifiesAlone()
    await appendOnlyAtTheDatabase()
    await scrubberStillRuns()
  } finally {
    await prisma.$disconnect()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
