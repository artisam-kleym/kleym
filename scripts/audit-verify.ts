/**
 * `pnpm audit:verify` — recompute the audit chain and exit non-zero if it
 * does not hold. For an operator's shell and for CI.
 */
import { applyEnvPlaceholders } from '../tests/env-placeholders'

applyEnvPlaceholders()
const { prisma } = await import('../src/lib/db/client')
const { verifyChain } = await import('../src/lib/api/audit-chain')

const result = await verifyChain()
await prisma.$disconnect()
console.log(JSON.stringify({ ...result, firstSeq: result.firstSeq?.toString() ?? null, lastSeq: result.lastSeq?.toString() ?? null, broken: result.broken && { seq: result.broken.seq.toString(), reason: result.broken.reason } }, null, 2))
process.exit(result.ok ? 0 : 1)
