/** GET /api/auth/session — the current user, or 401. */
import { getSessionUser } from '@/lib/auth/session'
import { unauthenticated } from '@/lib/auth/problems'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthenticated()
  return Response.json({ user })
}
