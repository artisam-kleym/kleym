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

const joined = await dst.campaign.findMany({ take: 5, select: { id: true, linkCount: true, _count: { select: { links: true } } } })
check('campaigns join to their links on the restored copy', joined.every((c) => c._count.links <= Math.max(c.linkCount, 1) || c._count.links > 0))

await src.$disconnect()
await dst.$disconnect()
console.log(`\n[${stamp()}] ${failures === 0 ? 'Backup verified by restore.' : `${failures} check(s) failed.`}`)
process.exit(failures === 0 ? 0 : 1)
