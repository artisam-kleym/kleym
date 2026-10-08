/** Read-only local deployment/journal status; no secrets or transaction submission. */
import { writeFileSync } from 'node:fs'
import { prisma } from '../../../../src/lib/db/client'
import { env } from '../../../../src/lib/config/env'

const [batches, attempts, health, ready] = await Promise.all([
  prisma.batch.groupBy({ by: ['status'], _count: true }),
  prisma.ledgerAttempt.groupBy({ by: ['status'], _count: true }),
  fetch('http://127.0.0.1:3220/api/health').then((r) => r.json()),
  fetch('http://127.0.0.1:3220/api/ready').then((r) => r.json()),
])
const result = { checkedAt: new Date().toISOString(), network: env.STELLAR_NETWORK, batches, attempts, health, ready }
if (process.argv.includes('--save')) writeFileSync('docs/reviews/2026-10-01/source-coordination/runtime.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result))
await prisma.$disconnect()
