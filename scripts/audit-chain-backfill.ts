/**
 * `pnpm audit:chain-backfill` — ONE-TIME, before the first deploy that
 * carries the chain writes anything: chains the rows that predate #49 and
 * moves the head to the last of them. Refuses if the head has already moved.
 * Idempotent in the sense that a second run finds nothing to chain.
 */
import { applyEnvPlaceholders } from '../tests/env-placeholders'

applyEnvPlaceholders()
const { prisma } = await import('../src/lib/db/client')
const { backfillLegacyRows, verifyChain } = await import('../src/lib/api/audit-chain')

try {
  const result = await backfillLegacyRows()
  const verified = await verifyChain()
  console.log(JSON.stringify({ chained: result.chained, lastSeq: result.lastSeq.toString(), verified: verified.ok, broken: verified.broken && { seq: verified.broken.seq.toString(), reason: verified.broken.reason } }, null, 2))
  process.exit(verified.ok ? 0 : 1)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(2)
} finally {
  await prisma.$disconnect()
}
