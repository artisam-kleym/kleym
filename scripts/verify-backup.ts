/**
 * `pnpm verify:backup` — backup verification that RESTORES, rather than
 * checking that a file exists. Issue #54.
 *
 * Dumps DATABASE_URL with pg_dump, restores it into RESTORE_DATABASE_URL (a
 * clean database on the same or another server), and then asks the restored
 * copy questions a file check cannot answer: every table's row count matches,
 * the migration ledger is intact, the audit chain verifies, and a sample of
 * campaigns joins to its links. Times each step. Needs `pg_dump` and `psql`.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyEnvPlaceholders } from '../tests/env-placeholders'

applyEnvPlaceholders()
const source = process.env.DATABASE_URL!
const target = process.env.RESTORE_DATABASE_URL
if (!target) {
  console.error('RESTORE_DATABASE_URL must point at a clean database to restore into')
  process.exit(2)
}
const started = process.hrtime.bigint()
const stamp = () => `${(Number(process.hrtime.bigint() - started) / 1e9).toFixed(1)}s`
let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  console.log(`  [${stamp()}] ${pass ? 'PASS' : 'FAIL'}  ${name}${pass || !detail ? '' : ` — ${detail}`}`)
  if (!pass) failures += 1
}
const run = (cmd: string, args: string[], input?: string) => spawnSync(cmd, args, { encoding: 'utf8', input, env: process.env, maxBuffer: 1 << 30 })

/*
 * Client and server major versions, checked FIRST. pg_dump refuses to dump a
 * server newer than itself, and the message it gives is the one an operator
 * hits on restore day with a laptop that lags the server — so say it plainly
 * before anything else runs.
 */
console.log('\n0. Client and server versions')
const clientVersion = run('pg_dump', ['--version'])
const clientMajor = Number(/\b(\d+)\./.exec(clientVersion.stdout ?? '')?.[1])
check('pg_dump is on PATH', clientVersion.status === 0, clientVersion.error?.message ?? clientVersion.stderr)
if (clientVersion.status !== 0) {
  console.log(`\n[${stamp()}] Not attempting the dump: install the Postgres client tools (pg_dump, psql) first.`)
  process.exit(1)
}
const serverVersion = run('psql', ['--tuples-only', '--no-align', '--command=SHOW server_version', source])
const serverMajor = Number(/^\s*(\d+)\./.exec(serverVersion.stdout ?? '')?.[1])
check('the server answered its version', serverVersion.status === 0 && Number.isFinite(serverMajor), serverVersion.stderr)
check(
  `client ${clientMajor} can dump server ${serverMajor}`,
  Number.isFinite(clientMajor) && Number.isFinite(serverMajor) && clientMajor >= serverMajor,
  `pg_dump is version ${clientMajor} and the server is ${serverMajor}: pg_dump refuses to dump a newer server. Install postgresql-client-${serverMajor} (or run the tools inside the server's container) and retry.`,
)
if (failures > 0) {
  console.log(`\n[${stamp()}] Not attempting the dump: fix the client first.`)
  process.exit(1)
}

const dir = mkdtempSync(join(tmpdir(), 'kleym-backup-'))
const file = join(dir, 'kleym.sql')
console.log('\n1. Dump')
const dump = run('pg_dump', ['--no-owner', '--no-privileges', '--format=plain', `--file=${file}`, source])
check('pg_dump completed', dump.status === 0, dump.stderr)

console.log('\n2. Restore into the clean database')
const restore = run('psql', ['--set=ON_ERROR_STOP=1', '--quiet', `--file=${file}`, target])
check('psql restore completed with no error', restore.status === 0, restore.stderr.slice(0, 400))

console.log('\n3. Ask the restored copy')
const { PrismaClient } = await import('../src/generated/prisma/client')
const { PrismaPg } = await import('@prisma/adapter-pg')
const client = (url: string) => new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
const src = client(source)
const dst = client(target)
const tables = ['User', 'Organization', 'Membership', 'Campaign', 'ClaimLink', 'Batch', 'Delivery', 'AuditLog', 'AuditChainHead', 'ApiKey', 'Session', 'ReconciliationFinding', 'ReclaimBatch', 'StrandedAccount', 'CampaignApproval', 'Invitation', 'IdempotencyKey', '_prisma_migrations']
for (const table of tables) {
  const a = await src.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table}"`)
  const b = await dst.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table}"`)
  check(`${table}: ${a[0]!.n} rows in both`, a[0]!.n === b[0]!.n, `${a[0]!.n} vs ${b[0]!.n}`)
}
const migrations = await dst.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`)
check('the migration ledger restored intact', Number(migrations[0]!.n) > 0)

process.env.DATABASE_URL = target
const { verifyChain } = await import('../src/lib/api/audit-chain')
const chain = await verifyChain()
check('the audit chain verifies on the restored copy', chain.ok, chain.broken?.reason)

/*
 * The FK survived the restore: the same campaigns hold the same number of
 * links on both sides. Compared per campaign id against the source, so a
 * restore that kept the rows but lost the join would fail here.
 */
const sample = await src.campaign.findMany({ take: 25, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: { id: true, _count: { select: { links: true } } } })
const restored = await dst.campaign.findMany({ where: { id: { in: sample.map((c) => c.id) } }, select: { id: true, _count: { select: { links: true } } } })
const restoredLinks = new Map(restored.map((c) => [c.id, c._count.links]))
const mismatched = sample.filter((c) => restoredLinks.get(c.id) !== c._count.links)
check(
  `${sample.length} sampled campaigns have the same link count on the restored copy`,
  sample.length > 0 && mismatched.length === 0,
  mismatched.slice(0, 3).map((c) => `${c.id}: ${c._count.links} vs ${restoredLinks.get(c.id) ?? 'missing'}`).join('; '),
)

await src.$disconnect()
await dst.$disconnect()
console.log(`\n[${stamp()}] ${failures === 0 ? 'Backup verified by restore.' : `${failures} check(s) failed.`}`)
process.exit(failures === 0 ? 0 : 1)
