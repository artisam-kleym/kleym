/**
 * Shared preamble for authenticated routes, and the ONE ownership predicate.
 *
 * Ownership is the ORGANISATION (issue #44). Every campaign query goes
 * through `owned()`, which builds `where: { id, organizationId }` — AGENT.md
 * §5.4 is explicit that ownership is enforced IN the query rather than
 * checked afterwards. A fetch-then-compare leaks the row's existence through
 * timing and through whatever the developer forgets to check.
 *
 * The scope a request acts in is resolved HERE, on every request, from the
 * caller's memberships: the session only remembers which organisation was
 * chosen last. So removing a membership ends that user's access to the
 * organisation's campaigns at once, live session or not.
 */
import { notFound, redirect } from 'next/navigation'
import type { OrgRole } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { stepUpGate } from '@/lib/auth/mfa/step-up'
import { stepUpRequired } from './problems'
import { getSessionUser, setActiveOrganization, type SessionUser } from '@/lib/auth/session'
import { forbidden, unauthenticated } from './problems'

export interface OrgScope {
  id: string
  name: string
  role: OrgRole
  /** Dual-control policy (#45): null threshold means off. */
  approvalThreshold: string | null
  approvalsRequired: number
  /** Compliance screening callback (#52): null means no screening. */
  screeningUrl: string | null
  /** MFA policy (#47). */
  mfaPolicy: 'OFF' | 'APPROVERS' | 'ALL'
  /** Accounting export (#80): the fiat currency journal lines are valued in. */
  reportingCurrency: string
}

export interface RequestScope {
  user: SessionUser
  org: OrgScope
}

/** Least to most capable. `roleAtLeast` compares positions in this list. */
export const ROLE_ORDER: readonly OrgRole[] = ['VIEWER', 'OPERATOR', 'APPROVER', 'OWNER']

export function roleAtLeast(role: OrgRole, required: OrgRole): boolean {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(required)
}

/**
 * The organisation a user acts in: the session's choice if they are still a
 * member of it, otherwise their first membership. Null for a user with no
 * membership at all, which the layout turns into a "no organisation" page.
 */
export async function resolveScope(user: SessionUser): Promise<OrgScope | null> {
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { role: true, organization: { select: { id: true, name: true, approvalThreshold: true, approvalsRequired: true, screeningUrl: true, mfaPolicy: true, reportingCurrency: true } } },
  })
  if (memberships.length === 0) return null

  const chosen = memberships.find((m) => m.organization.id === user.activeOrganizationId) ?? memberships[0]!
  if (chosen.organization.id !== user.activeOrganizationId) {
    // Remember the fallback so the switcher and the pages agree next request.
    await setActiveOrganization(user.sessionId, chosen.organization.id).catch(() => undefined)
  }
  return {
    id: chosen.organization.id,
    name: chosen.organization.name,
    role: chosen.role,
    approvalThreshold: chosen.organization.approvalThreshold?.toFixed() ?? null,
    approvalsRequired: chosen.organization.approvalsRequired,
    screeningUrl: chosen.organization.screeningUrl,
    mfaPolicy: chosen.organization.mfaPolicy,
    reportingCurrency: chosen.organization.reportingCurrency,
  }
}

/** Every organisation the user belongs to, for the switcher. */
export function membershipsOf(userId: string) {
  return prisma.membership.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { role: true, organization: { select: { id: true, name: true } } },
  })
}

/**
 * Authenticated AND scoped. `minimumRole` refuses below it with 403 — a
 * Viewer trying to sign, export or reclaim is a member who may not do that,
 * which is a different answer from "not yours" (404) and "not signed in" (401).
 */
export async function requireUser(minimumRole: OrgRole = 'VIEWER'): Promise<
  { user: SessionUser; org: OrgScope; response?: never } | { user?: never; org?: never; response: Response }
> {
  const user = await getSessionUser()
  if (!user) return { response: unauthenticated() }
  const org = await resolveScope(user)
  if (!org) return { response: forbidden('This account is not a member of any organisation.') }
  if (!roleAtLeast(org.role, minimumRole)) {
    return { response: forbidden(`This needs the ${minimumRole.toLowerCase()} role in ${org.name}.`) }
  }
  return { user, org }
}

/** The only correct way to address a campaign: id AND organisation, together. */
export function owned(campaignId: string, organizationId: string) {
  return { id: campaignId, organizationId }
}

/**
 * For server components under (sender): the layout has already redirected an
 * anonymous visitor and shown the no-organisation page to a member of none,
 * so a page reaching here has both. `notFound()` covers the impossible case
 * (a membership removed between the layout and the page).
 */
export async function pageScope(): Promise<RequestScope> {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const org = await resolveScope(user)
  if (!org) notFound()
  return { user, org }
}

/**
 * Step-up (#47): the actions that move money ask for a factor verified in
 * the last five minutes, whatever the session's age. Null when the caller
 * may proceed; a response otherwise. Routes call this AFTER requireUser.
 */
export async function requireStepUp(user: SessionUser): Promise<Response | null> {
  return (await stepUpGate(user.id, user.sessionId)) ? stepUpRequired() : null
}
