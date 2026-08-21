/**
 * Idempotency for mutating endpoints. AGENT.md §4.3.
 *
 * Replaying a key returns the STORED response without re-executing. Network
 * retries and double-clicks will happen, and this is a payments system: the
 * same request arriving twice must not create two campaigns or two batches.
 */
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db/client'
import { conflict, idempotencyKeyRequired } from './problems'

export interface IdempotencyHit {
  response: Response
}

function hashRequest(route: string, body: unknown): string {
  return createHash('sha256').update(`${route}\n${JSON.stringify(body ?? null)}`).digest('hex')
}

/**
 * Looks up a prior response for this key.
 *
 * SCOPED BY userId, deliberately.
 *
 * `IdempotencyKey.key` is a global primary key in SPEC §4, so two users
 * presenting the same client-supplied value collide — and a replay returns the
 * stored response, which would be another user's. Keys are client-chosen, so a
 * collision needs no guesswork: a fixed UUID in a client library is enough.
 *
 * Filtering on userId here makes that impossible even though the schema
 * permits it. `@@id([userId, key])` would make it structural instead; raised
 * on this issue for a SPEC amendment.
 */
export async function checkIdempotency(
  request: Request,
  context: { userId: string; route: string; body: unknown },
): Promise<IdempotencyHit | null> {
  const key = request.headers.get('idempotency-key')
  if (!key) return { response: idempotencyKeyRequired() }

  const requestHash = hashRequest(context.route, context.body)

  const existing = await prisma.idempotencyKey.findFirst({
    where: { key, userId: context.userId },
  })

  if (!existing) return null

  // Same key, different request: the client reused a key for something else.
  // Returning the stored response would answer a question they did not ask.
  if (existing.requestHash !== requestHash) {
    return {
      response: conflict(
        'This Idempotency-Key was already used for a different request. Use a new key.',
      ),
    }
  }

  if (existing.response === null || existing.statusCode === null) {
    // The original is still in flight. Replaying now could double-execute.
    return {
      response: conflict('A request with this Idempotency-Key is still in progress.'),
    }
  }

  return {
    response: new Response(JSON.stringify(existing.response), {
      status: existing.statusCode,
      headers: { 'content-type': 'application/json', 'idempotent-replay': 'true' },
    }),
  }
}

/** Records the outcome so a replay can return it without re-executing. */
export async function storeIdempotentResult(
  request: Request,
  context: { userId: string; route: string; body: unknown },
  result: { status: number; body: unknown },
): Promise<void> {
  const key = request.headers.get('idempotency-key')
  if (!key) return

  await prisma.idempotencyKey.upsert({
    where: { key },
    create: {
      key,
      userId: context.userId,
      requestHash: hashRequest(context.route, context.body),
      response: result.body as never,
      statusCode: result.status,
    },
    update: { response: result.body as never, statusCode: result.status },
  })
}
