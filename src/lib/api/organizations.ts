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
import type { OrgRole, Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { isUniqueViolation } from '@/lib/db/errors'
import { isWriteConflict } from './links'
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

const NEEDS_AN_OWNER = 'An organisation needs at least one owner.'

/**
 * A write that must leave at least one owner behind, done as ONE serializable
 * transaction: the count and the write see the same rows, so two owners
 * demoting (or removing) each other at the same moment cannot both pass the
 * count and leave the organisation with none. The loser of the serialization
 * conflict gets the same answer as a plain refusal — the other write won, and
 * it is now the last owner. Same shape as `planOnce` in lib/api/batches.ts.
 */
async function keepingAnOwner(
  organizationId: string,
  isOwner: boolean,
  write: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<'ok' | 'last-owner'> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        if (isOwner) {
          const owners = await tx.membership.count({ where: { organizationId, role: 'OWNER', user: { isActive: true } } })
          if (owners <= 1) return 'last-owner' as const
        }
        await write(tx)
        return 'ok' as const
      },
      { isolationLevel: 'Serializable' },
    )
  } catch (error) {
    if (isWriteConflict(error)) return 'last-owner'
    throw error
  }
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
  const result = await keepingAnOwner(org.id, membership.role === 'OWNER' && role !== 'OWNER', (tx) =>
    tx.membership.update({ where: { organizationId_userId: { organizationId: org.id, userId } }, data: { role } }).then(() => undefined),
  )
  if (result === 'last-owner') return { kind: 'conflict', detail: NEEDS_AN_OWNER }
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
  const result = await keepingAnOwner(org.id, membership.role === 'OWNER', async (tx) => {
    await tx.membership.delete({ where: { organizationId_userId: { organizationId: org.id, userId } } })
    await tx.session.updateMany({ where: { userId, activeOrganizationId: org.id }, data: { activeOrganizationId: null } })
  })
  if (result === 'last-owner') return { kind: 'conflict', detail: NEEDS_AN_OWNER }
  await recordAudit({
    userId: actorId, organizationId: org.id, action: 'org.member_remove', entityType: 'user', entityId: userId,
    metadata: { username: membership.user.username, orgRole: membership.role }, ip,
  })
  logger.info({ actorId, organizationId: org.id, userId }, 'member removed')
  return { kind: 'ok', username: membership.user.username }
}

export async function setApprovalPolicy(
  actorId: string,
  org: OrgScope,
  policy: { approvalThreshold: string | null; approvalsRequired: number },
  ip: string | null,
): Promise<void> {
  await prisma.organization.update({ where: { id: org.id }, data: policy })
  await recordAudit({
    userId: actorId, organizationId: org.id, action: 'org.approval_policy', entityType: 'organization', entityId: org.id,
    metadata: { approvalThreshold: policy.approvalThreshold, approvalsRequired: policy.approvalsRequired }, ip,
  })
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
