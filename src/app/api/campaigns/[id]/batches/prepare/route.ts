/**
 * POST /api/campaigns/[id]/batches/prepare — unsigned XDR for one batch.
 *
 * SPEC.md §3.2. Returns an envelope for the sender's wallet to sign; Kleym
 * never holds a key that could sign it (SPEC.md §8, AGENT.md §1).
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { requireUser } from '@/lib/api/session-guard'
import { conflict, notFound, serverError, validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'
import { prepareBatch, prepareSchema } from '@/lib/api/batches'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OPERATOR')
  if (!user) return response
  const { id } = await params

  let body: unknown = {}
  const raw = await request.text()
  if (raw.length > 0) {
    try {
      body = JSON.parse(raw)
    } catch {
      return validationProblem([{ path: '', message: 'malformed JSON' }])
    }
  }

  // Before Zod: a seed in an unknown key would otherwise be stripped unseen.
  const blocked = guardRequestBody(body, {
    route: '/api/campaigns/[id]/batches/prepare',
    ip: clientIp(request),
  })
  if (blocked) return blocked.response

  const parsed = prepareSchema.safeParse(body)
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))

  /*
   * No Idempotency-Key. Preparing is a read that builds an envelope — it
   * creates no on-chain state and no money moves, so replaying it is exactly
   * what a sender who reloaded the page wants. AGENT.md §4.3 scopes the
   * requirement to endpoints that touch chain state; submit is the one here
   * that does.
   */
  try {
    const outcome = await prepareBatch(id, org.id, parsed.data)
    if (outcome.kind === 'not-found') return notFound()
    if (outcome.kind === 'conflict') return conflict(outcome.detail)

    logger.info(
      { userId: user.id, campaignId: id, sequence: outcome.value.sequence, links: outcome.value.linkCount },
      'batch prepared',
    )
    return Response.json(outcome.value)
  } catch (error) {
    logger.error(
      { userId: user.id, campaignId: id, reason: error instanceof Error ? error.message : 'unknown' },
      'batch prepare failed',
    )
    return serverError()
  }
}
