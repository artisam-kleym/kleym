/** Isolated Redis persistence proof: held legacy payload, no new bearer delivery. No remote mail. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
applyEnvPlaceholders()
process.env.LEGACY_BEARER_EMAIL_ENABLED = 'false'
const { env } = await import('../src/lib/config/env')
assert(env.NODE_ENV === 'test' && env.STELLAR_NETWORK === 'testnet')
const { enqueueDelivery, deliveryJobs } = await import('../src/lib/queue/email')
const { startEmailWorker } = await import('../src/workers/email')
const { prisma } = await import('../src/lib/db/client')
const { redis } = await import('../src/lib/redis/client')
const marker = randomUUID()
const payload = { kind: 'claim' as const, deliveryId: marker, linkId: marker, email: 'fixture@example.test',
  claimUrl: 'https://example.test/claim#inert-historical-fixture', senderName: 'Fixture', amount: '1', assetCode: 'USDC',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(), otpRequired: false }
const queue = deliveryJobs()
let providerCalls = 0
let worker: ReturnType<typeof startEmailWorker> | undefined
async function waitHeld() {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const job = await queue.getJob(marker)
    if (job && await job.getState() === 'delayed') return job
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('Legacy fixture was not held within the bounded wait')
}
try {
  await assert.rejects(enqueueDelivery(payload), /disabled/)
  assert(!(await queue.getJob(marker)))
  console.log('PASS blocked ingress creates no job while workers are stopped')
  // Simulate a pre-existing legacy job using an inert, non-key payload. Only
  // this script-owned fixture is removed in cleanup; real legacy jobs are held.
  await queue.add('legacy-fixture', payload, { jobId: marker, removeOnComplete: true, removeOnFail: true })
  worker = startEmailWorker(async () => { providerCalls++; return { id: 'inert-provider' } })
  const first = await waitHeld()
  await first.promote() // Explicit retry of this script-owned historical fixture.
  const stored = await waitHeld()
  assert.deepEqual(stored.data, payload)
  assert.equal(providerCalls, 0)
  assert.equal(stored.attemptsMade, 0)
  console.log('PASS stopped/retried legacy payload stays held without provider access or silent deletion')
} finally {
  await worker?.close()
  await (await queue.getJob(marker))?.remove()
  await queue.close(); redis.disconnect(); await prisma.$disconnect()
}
