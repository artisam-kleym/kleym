/**
 * POST /api/invite/redeem — set a password against an invitation. SPEC.md §5.4.
 *
 * Unauthenticated and credential-accepting, so it sits behind the same rate
 * limit shape as login (AGENT.md §5.6). Unknown, expired and already-redeemed
 * tokens all answer the same 404 — the refusal's shape must not say which.
 * The token is never logged: it reaches this file in the body and nowhere else.
 */
import { logger } from '@/lib/config/logger'
import { clientIp } from '@/lib/auth/client-ip'
import { INVITE_REDEEM_RATE_LIMIT, rateLimit } from '@/lib/auth/rate-limit'
import { invalidRequest, serverError, tooManyAttempts } from '@/lib/auth/problems'
import { redeemInvitation, redeemSchema } from '@/lib/api/invitations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function invitationNotValid(): Response {
  return new Response(
    JSON.stringify({
      type: 'https://kleym.app/problems/invitation-not-valid',
      title: 'Invitation not valid',
      status: 404,
      detail: 'This invitation is not valid. Ask the person who invited you for a new link.',
    }),
    { status: 404, headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' } },
  )
}

export async function POST(request: Request) {
  const ip = clientIp(request)
  try {
    const parsed = redeemSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      // Field names only. A malformed token is reported as malformed, never echoed.
      return invalidRequest(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
    }

    const limit = await rateLimit(`invite:${ip}`, INVITE_REDEEM_RATE_LIMIT.limit, INVITE_REDEEM_RATE_LIMIT.windowSeconds)
    if (!limit.allowed) {
      logger.warn({ securityEvent: 'INVITE_RATE_LIMITED', ip }, 'invitation redemption rate limited')
      return tooManyAttempts(limit.retryAfterSeconds)
    }

    const outcome = await redeemInvitation(parsed.data.token, parsed.data.password)
    if (outcome.kind === 'invalid') {
      logger.warn({ securityEvent: 'INVITE_REJECTED', ip }, 'invitation redemption refused')
      return invitationNotValid()
    }

    return Response.json({ username: outcome.username }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    logger.error({ ip, reason: error instanceof Error ? error.message : 'unknown' }, 'invitation redemption failed')
    return serverError()
  }
}
