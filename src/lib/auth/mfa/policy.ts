/**
 * Who must have a second factor. Issue #47.
 *
 * Per organisation: OFF, APPROVERS (Approver and Owner roles), or ALL. A
 * user in several organisations is bound by the strictest one that reaches
 * their role — a policy is a floor, and the floor a member stands on is the
 * highest of the floors they are on.
 */
import { prisma } from '@/lib/db/client'
import type { MfaPolicy, OrgRole } from '@/generated/prisma/client'

export function policyReaches(policy: MfaPolicy, role: OrgRole): boolean {
  if (policy === 'ALL') return true
  if (policy === 'APPROVERS') return role === 'APPROVER' || role === 'OWNER'
  return false
}

/** True when any organisation the user belongs to requires MFA of their role. */
export async function mfaRequiredFor(userId: string): Promise<boolean> {
  const memberships = await prisma.membership.findMany({ where: { userId }, select: { role: true, organization: { select: { mfaPolicy: true } } } })
  return memberships.some((m) => policyReaches(m.organization.mfaPolicy, m.role))
}
