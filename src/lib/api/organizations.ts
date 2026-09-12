/**
 * Organisation membership and settings. Issue #44.
 *
 * Everything here is done AS a member of the organisation in question —
 * the caller's `OrgScope` is the authority, and every write carries the
 * organisation id in its `where`. Owners manage members; nobody can remove
 * the last owner, because an organisation with no owner is recoverable only
 * from the database.
 */
import { z } from 'zod'
import type { OrgRole } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { isUniqueViolation } from '@/lib/db/errors'
import { recordAudit } from './audit'
import { createInvitedUser } from './invitations'
import type { OrgScope } from './session-guard'

export const ORG_ROLES = ['VIEWER', 'OPERATOR', 'APPROVER', 'OWNER'] as const

export const renameSchema = z.object({ name: z.string().trim().min(2).max(80) }).strict()
export const addMemberSchema = z
  .object({
    username: z.string().trim().min(3).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/i, 'letters, digits, dot, underscore or dash'),
    role: z.enum(ORG_ROLES).default('OPERATOR'),
  })
  .strict()
export const changeRoleSchema = z.object({ role: z.enum(ORG_ROLES) }).strict()
export const switchSchema = z.object({ organizationId: z.string().min(1) }).strict()

export interface MemberRow {
  userId: string
  username: string
  role: OrgRole
  isActive: boolean
  /** Still waiting on their invitation. */
  invited: boolean
  since: Date
}

export async function listMembers(organizationId: string): Promise<MemberRow[]> {
  const rows = await prisma.membership.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      role: true, createdAt: true,
      user: { select: { id: true, username: true, isActive: true, invitations: { where: { redeemedAt: null }, select: { id: true } } } },
    },
  })
  return rows.map((row) => ({
    userId: row.user.id,
    username: row.user.username,
    role: row.role,
    isActive: row.user.isActive,
    invited: !row.user.isActive && row.user.invitations.length > 0,
    since: row.createdAt,
  }))
}

export type MemberOutcome =
  | { kind: 'ok'; username: string; inviteUrl?: string; expiresAt?: Date }
  | { kind: 'not-found' }
  | { kind: 'conflict'; detail: string }

/**
 * Adds a member. An existing account gets a membership; an unknown username
 * gets an account, a membership and an invitation (the URL comes back once,
 * for the owner to pass on).
 */
export async function addMember(
  actorId: string,
  org: OrgScope,
  input: z.infer<typeof addMemberSchema>,
  ip: string | null,
): Promise<MemberOutcome> {
  const existing = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true, username: true } })
  if (!existing) {
    const invited = await createInvitedUser(
      actorId,
      { username: input.username, role: 'SENDER', organizationId: org.id, orgRole: input.role },
      ip,
    )
    if (invited.kind === 'conflict') return invited
    return { kind: 'ok', username: invited.user.username, inviteUrl: invited.inviteUrl, expiresAt: invited.expiresAt }
  }

  try {
    await prisma.membership.create({ data: { organizationId: org.id, userId: existing.id, role: input.role } })
  } catch (error) {
    if (isUniqueViolation(error)) return { kind: 'conflict', detail: `${existing.username} is already a member.` }
    throw error
  }
  await recordAudit({
    userId: actorId, organizationId: org.id, action: 'org.member_add', entityType: 'user', entityId: existing.id,
    metadata: { username: existing.username, orgRole: input.role }, ip,
  })
  logger.info({ actorId, organizationId: org.id, userId: existing.id, role: input.role }, 'member added')
  return { kind: 'ok', username: existing.username }
}

async function ownersOf(organizationId: string): Promise<number> {
  return prisma.membership.count({ where: { organizationId, role: 'OWNER', user: { isActive: true } } })
}

export async function changeRole(
  actorId: string,
  org: OrgScope,
  userId: string,
  role: OrgRole,
  ip: string | null,
): Promise<MemberOutcome> {
  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId } },
    select: { role: true, user: { select: { username: true } } },
  })
  if (!membership) return { kind: 'not-found' }
  if (membership.role === 'OWNER' && role !== 'OWNER' && (await ownersOf(org.id)) <= 1) {
    return { kind: 'conflict', detail: 'An organisation needs at least one owner.' }
  }
  await prisma.membership.update({ where: { organizationId_userId: { organizationId: org.id, userId } }, data: { role } })
  await recordAudit({
    userId: actorId, organizationId: org.id, action: 'org.member_role', entityType: 'user', entityId: userId,
    metadata: { username: membership.user.username, from: membership.role, to: role }, ip,
  })
  return { kind: 'ok', username: membership.user.username }
}

/**
 * Removes a member. Their access to this organisation's campaigns ends on
 * their next request, live session or not, because scope is resolved from
 * memberships every time (lib/api/session-guard.ts). Their sessions are
 * also cleared of this organisation as the active one, so the next request
 * lands in another of their organisations rather than a stale choice.
 */
export async function removeMember(
  actorId: string,
  org: OrgScope,
  userId: string,
  ip: string | null,
): Promise<MemberOutcome> {
  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId } },
    select: { role: true, user: { select: { username: true } } },
  })
  if (!membership) return { kind: 'not-found' }
  if (membership.role === 'OWNER' && (await ownersOf(org.id)) <= 1) {
    return { kind: 'conflict', detail: 'An organisation needs at least one owner.' }
  }
  await prisma.$transaction([
    prisma.membership.delete({ where: { organizationId_userId: { organizationId: org.id, userId } } }),
    prisma.session.updateMany({ where: { userId, activeOrganizationId: org.id }, data: { activeOrganizationId: null } }),
  ])
  await recordAudit({
    userId: actorId, organizationId: org.id, action: 'org.member_remove', entityType: 'user', entityId: userId,
    metadata: { username: membership.user.username, orgRole: membership.role }, ip,
  })
  logger.info({ actorId, organizationId: org.id, userId }, 'member removed')
  return { kind: 'ok', username: membership.user.username }
}

export async function renameOrganization(actorId: string, org: OrgScope, name: string, ip: string | null): Promise<void> {
  await prisma.organization.update({ where: { id: org.id }, data: { name } })
  await recordAudit({
    userId: actorId, organizationId: org.id, action: 'org.rename', entityType: 'organization', entityId: org.id,
    metadata: { from: org.name, to: name }, ip,
  })
}

/** For the admin create-user form and the admin users page. */
export function listOrganizations() {
  return prisma.organization.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, _count: { select: { memberships: true, campaigns: true } } },
  })
}
