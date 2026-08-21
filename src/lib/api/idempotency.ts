/**
 * Idempotency for mutating endpoints. AGENT.md §4.3.
 *
 * Replaying a key returns the STORED response without re-executing. Network
 * retries and double-clicks will happen, and this is a payments system: the
 * same request arriving twice must not create two campaigns or two batches.
 *
 * The row is RESERVED before the work runs, not written after it.
 *
 * A store-after design leaves a window: two requests carrying the same key
 * arrive together, both find no row, both execute, and the second overwrites
 * the first's record. Reserving first — inserting with a null response and
 * letting the primary key reject the loser — closes it, and is what makes the
 * "still in progress" branch below reachable at all.
 */
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { conflict, idempotencyKeyRequired } from './problems'

export interface IdempotencyContext {
  userId: string
  route: string
  body: unknown
}

/** Either the caller holds the reservation and should execute, or it must not. */
export type IdempotencyOutcome =
  | { reserved: true; response?: never }
  | { reserved?: never; response: Response }

function hashRequest(route: string, body: unknown): string {
  return createHash('sha256').update(`${route}\n${JSON.stringify(body ?? null)}`).digest('hex')
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
}

/** Header value, or null when the client did not send one. */
function keyOf(request: Request): string | null {
  return request.headers.get('idempotency-key')
}

/**
 * Claims the key for this request, or returns the response that replaces
 * executing it: a stored replay, a conflict, or the missing-header problem.
 *
 * SCOPED BY userId, structurally.
 *
 * `IdempotencyKey` is keyed on `@@id([userId, key])`, not on `key` alone.
 * Keys are client-chosen, so two users presenting the same value is not a
 * guessing game — a fixed UUID baked into a client library is enough. With a
 * global primary key the read could be filtered by user but the WRITE could
 * not, because `upsert` cannot express a non-unique selector: one user's
 * result would land in another user's row and be replayed back to them.
 * The composite key removes the possibility rather than guarding against it.
 */
export async function beginIdempotency(
  request: Request,
  context: IdempotencyContext,
): Promise<IdempotencyOutcome> {
  const key = keyOf(request)
  if (!key) return { response: idempotencyKeyRequired() }

  const requestHash = hashRequest(context.route, context.body)

  try {
    // `response` and `statusCode` are left unset: a reservation is precisely a
    // row with no outcome yet. Prisma's Json? input type does not accept a
    // literal null, and DbNull here would say the same thing more loudly.
    await prisma.idempotencyKey.create({
      data: { key, userId: context.userId, requestHash },
    })
    return { reserved: true }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
  }

  // Someone got here first — this request, earlier, or the same request racing.
  const existing = await prisma.idempotencyKey.findUnique({
    where: { userId_key: { userId: context.userId, key } },
  })

  // Lost the insert but the row is already gone: a concurrent failure released
  // its reservation. Treat as a conflict rather than executing unreserved.
  if (!existing) {
    return { response: conflict('A request with this Idempotency-Key is still resolving. Retry.') }
  }

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

/** Records the outcome on the reserved row so a replay can return it. */
export async function storeIdempotentResult(
  request: Request,
  context: IdempotencyContext,
  result: { status: number; body: unknown },
): Promise<void> {
  const key = keyOf(request)
  if (!key) return

  await prisma.idempotencyKey.update({
    where: { userId_key: { userId: context.userId, key } },
    data: { response: result.body as never, statusCode: result.status },
  })
}

/**
 * Drops the reservation when the work did not complete.
 *
 * Without this a failed request poisons its key permanently: every retry finds
 * a row with a null response and is told the original is still in progress,
 * which is exactly when a client most wants to retry.
 */
export async function releaseIdempotency(
  request: Request,
  context: IdempotencyContext,
): Promise<void> {
  const key = keyOf(request)
  if (!key) return

  try {
    await prisma.idempotencyKey.delete({
      where: { userId_key: { userId: context.userId, key } },
    })
  } catch (error) {
    // Best-effort. A stuck reservation is worse than a noisy log, but failing
    // the release must not mask the error that caused it.
    logger.warn(
      { route: context.route, reason: error instanceof Error ? error.message : 'unknown' },
      'idempotency reservation release failed',
    )
  }
}
