/**
 * SCIM 2.0 provisioning and DEPROVISIONING. Issue #46.
 *
 * Per-organisation bearer tokens, opaque and stored hashed like a session.
 * Users are Kleym users with an unusable password, a membership in the
 * organisation and an SsoIdentity on the IdP's `externalId` — the same
 * stable identifier the OIDC subject claim carries — so provisioning and
 * sign-in meet on an id, never on an email. Groups map to roles through
 * the connection's mappings; a group change re-derives the role in the
 * same request. Deactivation (`active: false`, or DELETE) ends the
 * membership and revokes EVERY live session for the user, in one request.
 */
import { createHash, randomBytes } from 'node:crypto'
import type { OrgRole } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { hashPassword } from '@/lib/auth/password'
import { recordAudit } from '@/lib/api/audit'
import { roleFor } from './accounts'

export const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User'
export const SCIM_GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group'
export const SCIM_LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse'
export const SCIM_PATCH_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:PatchOp'
export const SCIM_ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error'

/* ── tokens ────────────────────────────────────────────────────────────── */

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

export async function issueScimToken(actorId: string, organizationId: string, name: string, ip: string | null): Promise<{ id: string; prefix: string; token: string }> {
  const prefix = randomBytes(4).toString('hex')
  const token = `scim_${prefix}_${randomBytes(32).toString('base64url')}`
  const row = await prisma.scimToken.create({ data: { organizationId, name, prefix, tokenHash: hashToken(token) }, select: { id: true } })
  await recordAudit({ userId: actorId, organizationId, action: 'scim.token_issued', entityType: 'organization', entityId: organizationId, metadata: { prefix, name }, ip })
  return { id: row.id, prefix, token }
}

export async function revokeScimToken(organizationId: string, id: string): Promise<boolean> {
  const r = await prisma.scimToken.updateMany({ where: { id, organizationId, revokedAt: null }, data: { revokedAt: new Date() } })
  return r.count > 0
}

export function listScimTokens(organizationId: string) {
  return prisma.scimToken.findMany({ where: { organizationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true } })
}

/** `Authorization: Bearer scim_…` → the organisation, or null. A revoked token is a wrong token. */
export async function resolveScimToken(request: Request): Promise<{ organizationId: string; tokenId: string } | null> {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer (scim_[a-f0-9]{8}_[A-Za-z0-9_-]{40,})$/.exec(header.trim())
  if (!match) return null
  const row = await prisma.scimToken.findUnique({ where: { tokenHash: hashToken(match[1]!) }, select: { id: true, organizationId: true, revokedAt: true } })
  if (!row || row.revokedAt) return null
  await prisma.scimToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)
  return { organizationId: row.organizationId, tokenId: row.id }
}

/* ── the organisation's role source ────────────────────────────────────── */

async function roleSource(organizationId: string): Promise<{ id: string; organizationId: string; defaultRole: OrgRole; mappings: { group: string; role: OrgRole }[] } | null> {
  const c = await prisma.ssoConnection.findUnique({ where: { organizationId }, select: { id: true, defaultRole: true, mappings: { select: { group: true, role: true } } } })
  return c ? { id: c.id, organizationId, defaultRole: c.defaultRole, mappings: c.mappings } : null
}

/** Re-derives one member's role from the SCIM groups they are in. */
export async function syncRole(organizationId: string, userId: string): Promise<OrgRole | null> {
  const source = await roleSource(organizationId)
  if (!source) return null
  const groups = await prisma.scimGroupMember.findMany({ where: { userId, group: { organizationId } }, select: { group: { select: { displayName: true } } } })
  const role = roleFor(groups.map((g) => g.group.displayName), source)
  const updated = await prisma.membership.updateMany({ where: { organizationId, userId }, data: { role } })
  return updated.count > 0 ? role : null
}

/* ── users ─────────────────────────────────────────────────────────────── */

export interface ScimUserRow {
  id: string
  username: string
  isActive: boolean
  externalId: string | null
  groups: { id: string; displayName: string }[]
  role: OrgRole | null
  createdAt: Date
}

export function scimUser(row: ScimUserRow, base: string) {
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: row.id,
    ...(row.externalId ? { externalId: row.externalId } : {}),
    userName: row.username,
    active: row.isActive && row.role !== null,
    groups: row.groups.map((g) => ({ value: g.id, display: g.displayName, $ref: `${base}/Groups/${g.id}` })),
    'urn:kleym:scim:role': row.role,
    meta: { resourceType: 'User', created: row.createdAt.toISOString(), location: `${base}/Users/${row.id}` },
  }
}

async function loadUser(organizationId: string, userId: string): Promise<ScimUserRow | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, username: true, isActive: true, createdAt: true,
      memberships: { where: { organizationId }, select: { role: true } },
      ssoIdentities: { where: { connection: { organizationId } }, select: { subject: true } },
      scimGroups: { where: { group: { organizationId } }, select: { group: { select: { id: true, displayName: true } } } },
    },
  })
  // Only members (present or past-provisioned in this organisation) are this tenant's to see.
  if (!u || (u.memberships.length === 0 && u.ssoIdentities.length === 0)) return null
  return { id: u.id, username: u.username, isActive: u.isActive, createdAt: u.createdAt, externalId: u.ssoIdentities[0]?.subject ?? null, groups: u.scimGroups.map((g) => g.group), role: u.memberships[0]?.role ?? null }
}

export async function listUsers(organizationId: string, filter: { userName?: string; externalId?: string }, startIndex = 1, count = 100): Promise<{ total: number; rows: ScimUserRow[] }> {
  const where = {
    OR: [{ memberships: { some: { organizationId } } }, { ssoIdentities: { some: { connection: { organizationId } } } }],
    ...(filter.userName ? { username: { equals: filter.userName, mode: 'insensitive' as const } } : {}),
    ...(filter.externalId ? { ssoIdentities: { some: { connection: { organizationId }, subject: filter.externalId } } } : {}),
  }
  const [total, ids] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: Math.max(0, startIndex - 1), take: Math.min(count, 200), select: { id: true } }),
  ])
  const rows = (await Promise.all(ids.map((u) => loadUser(organizationId, u.id)))).filter((r): r is ScimUserRow => r !== null)
  return { total, rows }
}

export type CreateOutcome = { kind: 'ok'; row: ScimUserRow } | { kind: 'conflict'; detail: string }

/**
 * Creates a member. A username that already belongs to a user who is NOT a
 * member here is a collision, refused: attaching an IdP-provisioned identity
 * to a pre-existing local account is the email-only link this design forbids.
 */
export async function createUser(organizationId: string, input: { userName: string; externalId?: string; active?: boolean }, ip: string | null): Promise<CreateOutcome> {
  const source = await roleSource(organizationId)
  if (!source) return { kind: 'conflict', detail: 'This organisation has no SSO connection; configure one before provisioning.' }
  const username = input.userName.trim().toLowerCase()
  const existing = await prisma.user.findFirst({ where: { username: { equals: username, mode: 'insensitive' } }, select: { id: true, memberships: { where: { organizationId }, select: { id: true } } } })
  if (existing) {
    if (existing.memberships.length > 0) return { kind: 'conflict', detail: 'A member with that userName already exists.' }
    await recordAudit({ userId: null, organizationId, action: 'sso.link_refused', entityType: 'user', entityId: existing.id, metadata: { reason: 'scim userName matches an existing local account', via: 'scim' }, ip })
    return { kind: 'conflict', detail: 'That userName belongs to an existing Kleym account that is not a member of this organisation. Link it explicitly from that account, or use another userName.' }
  }
  const subject = input.externalId?.trim() || `scim:${username}`
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(randomBytes(32).toString('hex')),
      role: 'SENDER',
      isActive: input.active !== false,
      memberships: { create: { organizationId, role: source.defaultRole } },
      ssoIdentities: { create: { connectionId: source.id, subject } },
    },
    select: { id: true },
  })
  await recordAudit({ userId: null, organizationId, action: 'scim.user_created', entityType: 'user', entityId: user.id, metadata: { via: 'scim', active: input.active !== false }, ip })
  logger.info({ userId: user.id, organizationId }, 'scim: user created')
  return { kind: 'ok', row: (await loadUser(organizationId, user.id))! }
}

export async function getUser(organizationId: string, userId: string): Promise<ScimUserRow | null> {
  return loadUser(organizationId, userId)
}

/**
 * Deactivation: the membership ends, every live session is revoked, and the
 * account itself is deactivated when this was its only organisation. One
 * request; the hour after a termination is covered.
 */
export async function deactivateUser(organizationId: string, userId: string, ip: string | null): Promise<{ kind: 'not-found' } | { kind: 'ok'; sessionsEnded: number; accountDeactivated: boolean }> {
  const row = await loadUser(organizationId, userId)
  if (!row) return { kind: 'not-found' }
  const others = await prisma.membership.count({ where: { userId, organizationId: { not: organizationId } } })
  const [, sessions] = await prisma.$transaction([
    prisma.membership.deleteMany({ where: { userId, organizationId } }),
    prisma.session.deleteMany({ where: { userId } }),
    ...(others === 0 ? [prisma.user.update({ where: { id: userId }, data: { isActive: false } })] : []),
  ])
  await recordAudit({ userId: null, organizationId, action: 'scim.user_deactivated', entityType: 'user', entityId: userId, metadata: { sessionsEnded: sessions.count, accountDeactivated: others === 0 }, ip })
  logger.warn({ userId, organizationId, sessionsEnded: sessions.count, accountDeactivated: others === 0 }, 'scim: user deactivated')
  return { kind: 'ok', sessionsEnded: sessions.count, accountDeactivated: others === 0 }
}

/** Reactivation: the membership returns at the mapped role; the account is live again. */
export async function activateUser(organizationId: string, userId: string, ip: string | null): Promise<ScimUserRow | null> {
  const row = await loadUser(organizationId, userId)
  if (!row) return null
  const source = await roleSource(organizationId)
  if (!source) return null
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { isActive: true } }),
    prisma.membership.upsert({ where: { organizationId_userId: { organizationId, userId } }, create: { organizationId, userId, role: source.defaultRole }, update: {} }),
  ])
  await syncRole(organizationId, userId)
  await recordAudit({ userId: null, organizationId, action: 'scim.user_updated', entityType: 'user', entityId: userId, metadata: { active: true }, ip })
  return loadUser(organizationId, userId)
}

/* ── groups ────────────────────────────────────────────────────────────── */

export interface ScimGroupRow {
  id: string
  displayName: string
  externalId: string | null
  members: { id: string; username: string }[]
  createdAt: Date
}

export function scimGroup(row: ScimGroupRow, base: string) {
  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: row.id,
    ...(row.externalId ? { externalId: row.externalId } : {}),
    displayName: row.displayName,
    members: row.members.map((m) => ({ value: m.id, display: m.username, $ref: `${base}/Users/${m.id}` })),
    meta: { resourceType: 'Group', created: row.createdAt.toISOString(), location: `${base}/Groups/${row.id}` },
  }
}

async function loadGroup(organizationId: string, id: string): Promise<ScimGroupRow | null> {
  const g = await prisma.scimGroup.findFirst({ where: { id, organizationId }, select: { id: true, displayName: true, externalId: true, createdAt: true, members: { select: { user: { select: { id: true, username: true } } } } } })
  return g ? { id: g.id, displayName: g.displayName, externalId: g.externalId, createdAt: g.createdAt, members: g.members.map((m) => m.user) } : null
}

export async function listGroups(organizationId: string, filter: { displayName?: string }, startIndex = 1, count = 100): Promise<{ total: number; rows: ScimGroupRow[] }> {
  const where = { organizationId, ...(filter.displayName ? { displayName: { equals: filter.displayName, mode: 'insensitive' as const } } : {}) }
  const [total, ids] = await Promise.all([prisma.scimGroup.count({ where }), prisma.scimGroup.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: Math.max(0, startIndex - 1), take: Math.min(count, 200), select: { id: true } })])
  const rows = (await Promise.all(ids.map((g) => loadGroup(organizationId, g.id)))).filter((r): r is ScimGroupRow => r !== null)
  return { total, rows }
}

/** Members must be this organisation's users; anyone else is silently not a member. */
async function memberIds(organizationId: string, values: string[]): Promise<string[]> {
  if (values.length === 0) return []
  const rows = await prisma.user.findMany({ where: { id: { in: values }, OR: [{ memberships: { some: { organizationId } } }, { ssoIdentities: { some: { connection: { organizationId } } } }] }, select: { id: true } })
  return rows.map((r) => r.id)
}

export async function createGroup(organizationId: string, input: { displayName: string; externalId?: string; members?: string[] }, ip: string | null): Promise<{ kind: 'ok'; row: ScimGroupRow } | { kind: 'conflict' }> {
  const existing = await prisma.scimGroup.findUnique({ where: { organizationId_displayName: { organizationId, displayName: input.displayName } }, select: { id: true } })
  if (existing) return { kind: 'conflict' }
  const members = await memberIds(organizationId, input.members ?? [])
  const g = await prisma.scimGroup.create({ data: { organizationId, displayName: input.displayName, externalId: input.externalId ?? null, members: { create: members.map((userId) => ({ userId })) } }, select: { id: true } })
  await Promise.all(members.map((u) => syncRole(organizationId, u)))
  await recordAudit({ userId: null, organizationId, action: 'scim.group_synced', entityType: 'group', entityId: g.id, metadata: { displayName: input.displayName, members: members.length, op: 'create' }, ip })
  return { kind: 'ok', row: (await loadGroup(organizationId, g.id))! }
}

export async function getGroup(organizationId: string, id: string): Promise<ScimGroupRow | null> {
  return loadGroup(organizationId, id)
}

/** Replace: the name and the full member set. */
export async function replaceGroup(organizationId: string, id: string, input: { displayName?: string; externalId?: string; members?: string[] }, ip: string | null): Promise<ScimGroupRow | null> {
  const before = await loadGroup(organizationId, id)
  if (!before) return null
  const members = input.members ? await memberIds(organizationId, input.members) : before.members.map((m) => m.id)
  await prisma.$transaction([
    prisma.scimGroup.update({ where: { id }, data: { ...(input.displayName ? { displayName: input.displayName } : {}), ...(input.externalId !== undefined ? { externalId: input.externalId } : {}) } }),
    prisma.scimGroupMember.deleteMany({ where: { groupId: id } }),
    prisma.scimGroupMember.createMany({ data: members.map((userId) => ({ groupId: id, userId })), skipDuplicates: true }),
  ])
  const touched = new Set([...before.members.map((m) => m.id), ...members])
  await Promise.all([...touched].map((u) => syncRole(organizationId, u)))
  await recordAudit({ userId: null, organizationId, action: 'scim.group_synced', entityType: 'group', entityId: id, metadata: { members: members.length, op: 'replace' }, ip })
  return loadGroup(organizationId, id)
}

export type GroupPatchOp = { op: 'add' | 'remove' | 'replace'; path?: string; value?: unknown }

/** PatchOp on members (add / remove, with or without a filter path) and displayName. */
export async function patchGroup(organizationId: string, id: string, ops: GroupPatchOp[], ip: string | null): Promise<ScimGroupRow | null> {
  const before = await loadGroup(organizationId, id)
  if (!before) return null
  const current = new Set(before.members.map((m) => m.id))
  let displayName: string | undefined
  for (const op of ops) {
    const kind = op.op.toLowerCase()
    const path = (op.path ?? '').trim()
    const valuesOf = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).map((x) => (typeof x === 'object' && x && 'value' in x ? String((x as { value: unknown }).value) : String(x))).filter(Boolean)
    if (path === 'displayName' || (path === '' && typeof op.value === 'object' && op.value && 'displayName' in op.value)) {
      displayName = path === 'displayName' ? String(op.value) : String((op.value as { displayName: unknown }).displayName)
      continue
    }
    if (path === 'members' || path === '' || path.startsWith('members[')) {
      let ids: string[]
      if (path.startsWith('members[')) {
        const m = /members\[value eq "([^"]+)"\]/.exec(path)
        ids = m ? [m[1]!] : []
      } else {
        const raw = path === '' && typeof op.value === 'object' && op.value && 'members' in op.value ? (op.value as { members: unknown }).members : op.value
        ids = valuesOf(raw)
      }
      if (kind === 'remove') ids.forEach((i) => current.delete(i))
      else if (kind === 'replace' && !path.startsWith('members[')) {
        current.clear()
        for (const i of await memberIds(organizationId, ids)) current.add(i)
      } else for (const i of await memberIds(organizationId, ids)) current.add(i)
    }
  }
  const members = [...current]
  await prisma.$transaction([
    ...(displayName ? [prisma.scimGroup.update({ where: { id }, data: { displayName } })] : []),
    prisma.scimGroupMember.deleteMany({ where: { groupId: id } }),
    prisma.scimGroupMember.createMany({ data: members.map((userId) => ({ groupId: id, userId })), skipDuplicates: true }),
  ])
  const touched = new Set([...before.members.map((m) => m.id), ...members])
  await Promise.all([...touched].map((u) => syncRole(organizationId, u)))
  await recordAudit({ userId: null, organizationId, action: 'scim.group_synced', entityType: 'group', entityId: id, metadata: { members: members.length, op: 'patch' }, ip })
  return loadGroup(organizationId, id)
}

export async function deleteGroup(organizationId: string, id: string, ip: string | null): Promise<boolean> {
  const before = await loadGroup(organizationId, id)
  if (!before) return false
  await prisma.scimGroup.delete({ where: { id } })
  await Promise.all(before.members.map((m) => syncRole(organizationId, m.id)))
  await recordAudit({ userId: null, organizationId, action: 'scim.group_synced', entityType: 'group', entityId: id, metadata: { op: 'delete' }, ip })
  return true
}
