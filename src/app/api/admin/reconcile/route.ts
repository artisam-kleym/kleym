/**
 * POST /api/admin/reconcile — the manual resync trigger. SPEC.md §5.4.
 *
 * Queues the SAME job the 5-minute cron queues (acceptance criterion 7): one
 * implementation of what reconciliation means, not a second that looks like it
 * and drifts. The request returns immediately; the work happens on the worker
 * with the same retry and concurrency behaviour.
 */
import { z } from 'zod'
import { logger } from '@/lib/config/logger'
import { getSessionUser } from '@/lib/auth/session'
import { notFound, serverError, validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'
import { requestReconcile } from '@/lib/queue/maintenance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ campaignId: z.string().min(1).optional() }).strict()

export async function POST(request: Request) {
  const user = await getSessionUser()

  /*
   * 404 for a non-admin, matching the admin layout: a signed-in SENDER should
   * not learn this endpoint exists. "Forbidden" confirms it; "not found" does
   * not.
   */
  if (!user || user.role !== 'ADMIN') return notFound()

  let body: unknown = {}
  const raw = await request.text()
  if (raw.length > 0) {
    try {
      body = JSON.parse(raw)
    } catch {
      return validationProblem([{ path: '', message: 'malformed JSON' }])
    }
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))

  try {
    await requestReconcile(parsed.data.campaignId)
    logger.info({ userId: user.id, campaignId: parsed.data.campaignId ?? null }, 'manual reconcile requested')
    return Response.json({ queued: true }, { status: 202 })
  } catch (error) {
    logger.error(
      { userId: user.id, reason: error instanceof Error ? error.message : 'unknown' },
      'could not queue a reconcile',
    )
    return serverError()
  }
}
