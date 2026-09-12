/**
 * Shared preamble for the MFA routes (#47): which session states may reach
 * which route. A pending session may verify; an enrolment-required session
 * may enrol; a signed-in session may do either (adding a factor, stepping up).
 */
import { resolveSession, type ResolvedSession, type SessionState } from '@/lib/auth/session'
import { unauthenticated } from '@/lib/api/problems'

export async function requireSessionIn(states: SessionState[]): Promise<{ session: ResolvedSession; response?: never } | { session?: never; response: Response }> {
  const session = await resolveSession()
  if (!session || !states.includes(session.state)) return { response: unauthenticated() }
  return { session }
}

export const MFA_VERIFY_RATE_LIMIT = { limit: 20, windowSeconds: 15 * 60 } as const
