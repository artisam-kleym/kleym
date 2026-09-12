/**
 * POST /api/campaigns/[id]/deliver — queue claim emails.
 *
 * SPEC.md §6.5. THE ONE DELIBERATE EXCEPTION in this system: the request body
 * carries full claim URLs, and a claim URL's fragment is an ephemeral secret
 * seed. Every other route runs `guardRequestBody`, which rejects a body
 * containing a seed with 400 SEED_SUBMITTED and records a security event.
 *
 * That guard is NOT applied to `recipients[].claimUrl`, and it cannot be:
 * the guard and this endpoint's entire purpose are in direct conflict. So the
 * exemption is made narrow and explicit rather than blanket —
 *
 *   - the guard still runs, over the body with the URLs REMOVED, so a seed
 *     smuggled into an email address, a public key or any other field is
 *     caught exactly as it would be anywhere else;
 *   - each URL must parse as this deployment's own /claim page and its seed
 *     must derive the public key of the link it is being sent for
 *     (lib/api/deliver.ts). An arbitrary URL cannot be mailed from Kleym's
 *     address;
 *   - nothing here logs the body, and the URL reaches no database column.
 *
 * AGENT.md §1: do not extend this exception anywhere else.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { guardRequestBody } from '@/lib/security/guard'
import { requireUser } from '@/lib/api/session-guard'
import {
  beginIdempotency,
  releaseIdempotency,
  storeIdempotentResult,
} from '@/lib/api/idempotency'
import { conflict, notFound, serverError, validationProblem } from '@/lib/api/problems'
import { zodErrors } from '@/lib/api/campaigns'
import { deliverSchema, queueDeliveries } from '@/lib/api/deliver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * The body with every `claimUrl` replaced, for the seed scan.
 *
 * Deleting the key rather than blanking it would let a seed hide in a
 * `claimUrl` that the schema has not validated yet; replacing the value keeps
 * the shape and drops only the thing that is allowed to be a seed here.
 */
function withoutUrls(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body
  const recipients = (body as { recipients?: unknown }).recipients
  if (!Array.isArray(recipients)) return body

  return {
    ...(body as object),
    recipients: recipients.map((recipient) =>
      typeof recipient === 'object' && recipient !== null
        ? { ...(recipient as object), claimUrl: '[the one exception — SPEC.md §6.5]' }
        : recipient,
    ),
  }
}

export async function POST(request: Request, { params }: Params) {
  const { user, org, response } = await requireUser('OPERATOR')
  if (!user) return response
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return validationProblem([{ path: '', message: 'malformed JSON' }])
  }

  // Everything EXCEPT the claim URLs is still held to the usual rule.
  const blocked = guardRequestBody(withoutUrls(body), {
    route: '/api/campaigns/[id]/deliver',
    ip: clientIp(request),
  })
  if (blocked) return blocked.response

  const parsed = deliverSchema.safeParse(body)
  if (!parsed.success) return validationProblem(zodErrors(parsed.error))

  const context = { userId: user.id, route: `/api/campaigns/${id}/deliver`, body }
  const idempotency = await beginIdempotency(request, context)
  if (!idempotency.reserved) return idempotency.response

  try {
    const outcome = await queueDeliveries(id, org.id, parsed.data)
    if (outcome.kind !== 'ok') {
      await releaseIdempotency(request, context)
      return outcome.kind === 'not-found' ? notFound() : conflict(outcome.detail)
    }

    const payload = outcome.value
    await storeIdempotentResult(request, context, { status: 202, body: payload })

    // Counts only. Not the addresses, and emphatically not the URLs.
    logger.info(
      { userId: user.id, campaignId: id, queued: payload.queued, skipped: payload.skipped.length },
      'delivery requested',
    )
    return Response.json(payload, { status: 202 })
  } catch (error) {
    await releaseIdempotency(request, context)
    logger.error(
      { userId: user.id, campaignId: id, reason: error instanceof Error ? error.message : 'unknown' },
      'delivery request failed',
    )
    return serverError()
  }
}
