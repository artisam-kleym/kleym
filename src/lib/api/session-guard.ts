/**
 * Shared preamble for authenticated campaign routes.
 *
 * Every campaign query goes through `owned()`, which builds a
 * `where: { id, userId }` clause. AGENT.md §5.4 is explicit that ownership is
 * enforced IN the query rather than checked afterwards — a fetch-then-compare
 * leaks the row's existence through timing and through whatever the developer
 * forgets to check.
 */
import { getSessionUser, type SessionUser } from '@/lib/auth/session'
import { unauthenticated } from './problems'

export async function requireUser(): Promise<
  { user: SessionUser; response?: never } | { user?: never; response: Response }
> {
  const user = await getSessionUser()
  if (!user) return { response: unauthenticated() }
  return { user }
}

/** The only correct way to address a campaign: id AND owner, together. */
export function owned(campaignId: string, userId: string) {
  return { id: campaignId, userId }
}
