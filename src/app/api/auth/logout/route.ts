/** POST /api/auth/logout — deletes the session row, not just the cookie. */
import { cookies } from 'next/headers'
import { revokeSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value

  // Deleting the row matters: clearing only the cookie would leave a valid
  // token that anyone who captured it could keep using.
  if (token) await revokeSession(token)
  store.set(SESSION_COOKIE, '', { ...sessionCookieOptions(new Date(0)), maxAge: 0 })

  return Response.json({ ok: true })
}
