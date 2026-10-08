/** Separate-process database admission fixture; public XDR only over IPC. */
import { prepareAttempt } from '../src/lib/stellar/attempts'
import { SourceCoordinationError } from '../src/lib/stellar/source-coordination'
import { prisma } from '../src/lib/db/client'

if (!process.send || process.env.NODE_ENV !== 'test') throw new Error('IPC test fixture only')
process.on('message', async (input: { scope: string; campaignId: string; xdr: string }) => {
  try {
    const saved = await prepareAttempt(input.scope, input.campaignId, 'CLAIM', input.xdr, {})
    process.send!({ ok: true, hash: saved.transactionHash })
  } catch (error) {
    process.send!({ ok: false, coordination: error instanceof SourceCoordinationError,
      error: error instanceof SourceCoordinationError ? error.message : 'Unexpected admission failure' })
  } finally {
    await prisma.$disconnect()
    process.disconnect!()
  }
})
process.send({ ready: true })
