/** DELETE /api/auth/mfa/passkey/[id] — remove a passkey. Takes a fresh factor. */
import { clientIp } from '@/lib/auth/client-ip'
import { requireSessionIn } from '@/lib/auth/mfa/routes'
import { removePasskey } from '@/lib/auth/mfa/passkeys'
import { requireStepUp } from '@/lib/api/session-guard'
import { notFound } from '@/lib/api/problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(request: Request, { params }: Params) {
  const { session, response } = await requireSessionIn(['ok'])
  if (!session) return response
  const stepUp = await requireStepUp(session.user)
  if (stepUp) return stepUp
  const { id } = await params
  if (!(await removePasskey(session.user.id, id, clientIp(request)))) return notFound()
  return new Response(null, { status: 204 })
}
