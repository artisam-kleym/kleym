/** An organisation's SSO connection, as an Owner manages it. Issue #46. */
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { recordAudit } from '@/lib/api/audit'
import type { OrgScope } from '@/lib/api/session-guard'
import { encryptAtRest } from '@/lib/auth/at-rest'
import type { OidcConnection } from './oidc'
import type { RoleSource } from './accounts'

export const ROLES = ['VIEWER', 'OPERATOR', 'APPROVER', 'OWNER'] as const

export const connectionSchema = z
  .object({
    handle: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,38}$/, 'letters, digits and dashes, 2–39 characters'),
    issuer: z.string().trim().url().refine((v) => v.startsWith('https://'), 'an https issuer URL'),
    clientId: z.string().trim().min(1).max(200),
    /** Omit on update to keep the stored one. */
    clientSecret: z.string().min(1).max(500).optional(),
    scopes: z.string().trim().min(6).max(200).default('openid profile email'),
    subjectClaim: z.string().trim().regex(/^[a-zA-Z0-9_.:-]{1,64}$/).default('sub'),
    groupsClaim: z.string().trim().regex(/^[a-zA-Z0-9_.:-]{1,64}$/).default('groups'),
    ssoOnly: z.boolean().default(false),
    defaultRole: z.enum(ROLES).default('VIEWER'),
    mappings: z.array(z.object({ group: z.string().trim().min(1).max(200), role: z.enum(ROLES) })).max(50).default([]),
  })
  .strict()

export type ConnectionInput = z.infer<typeof connectionSchema>

export const CONNECTION_SELECT = {
  id: true, organizationId: true, handle: true, protocol: true, issuer: true, clientId: true, clientCiphertext: true, scopes: true,
  subjectClaim: true, groupsClaim: true, ssoOnly: true, defaultRole: true, createdAt: true,
  mappings: { select: { group: true, role: true }, orderBy: [{ group: 'asc' }] },
} satisfies Prisma.SsoConnectionSelect

export type ConnectionRow = NonNullable<Awaited<ReturnType<typeof connectionForOrg>>>

export function connectionForOrg(organizationId: string) {
  return prisma.ssoConnection.findUnique({ where: { organizationId }, select: CONNECTION_SELECT })
}

export function connectionByHandle(handle: string) {
  return prisma.ssoConnection.findUnique({ where: { handle: handle.toLowerCase() }, select: CONNECTION_SELECT })
}

export function connectionById(id: string) {
  return prisma.ssoConnection.findUnique({ where: { id }, select: CONNECTION_SELECT })
}

/** The shapes the OIDC flow and the account resolver take, from one row. */
export function asOidc(row: ConnectionRow): OidcConnection {
  return { id: row.id, issuer: row.issuer, clientId: row.clientId, clientCiphertext: row.clientCiphertext, scopes: row.scopes, subjectClaim: row.subjectClaim, groupsClaim: row.groupsClaim }
}
export function asRoleSource(row: ConnectionRow): { id: string; organizationId: string } & RoleSource {
  return { id: row.id, organizationId: row.organizationId, defaultRole: row.defaultRole, mappings: row.mappings }
}

/** What the settings page shows: never the ciphertext, never a secret. */
export function publicView(row: ConnectionRow | null) {
  if (!row) return null
  return {
    id: row.id, handle: row.handle, protocol: row.protocol, issuer: row.issuer, clientId: row.clientId, scopes: row.scopes,
    subjectClaim: row.subjectClaim, groupsClaim: row.groupsClaim, ssoOnly: row.ssoOnly, defaultRole: row.defaultRole, mappings: row.mappings,
    createdAt: row.createdAt.toISOString(),
  }
}

export type UpsertOutcome = { kind: 'ok' } | { kind: 'handle-taken' } | { kind: 'secret-required' }

export async function upsertConnection(actorId: string, org: OrgScope, input: ConnectionInput, ip: string | null): Promise<UpsertOutcome> {
  const existing = await prisma.ssoConnection.findUnique({ where: { organizationId: org.id }, select: { id: true } })
  if (!existing && !input.clientSecret) return { kind: 'secret-required' }
  const handleOwner = await prisma.ssoConnection.findUnique({ where: { handle: input.handle }, select: { organizationId: true } })
  if (handleOwner && handleOwner.organizationId !== org.id) return { kind: 'handle-taken' }

  const fields = {
    handle: input.handle, issuer: input.issuer, clientId: input.clientId, scopes: input.scopes, subjectClaim: input.subjectClaim,
    groupsClaim: input.groupsClaim, ssoOnly: input.ssoOnly, defaultRole: input.defaultRole,
    ...(input.clientSecret ? { clientCiphertext: encryptAtRest(input.clientSecret) } : {}),
  }
  await prisma.$transaction(async (tx) => {
    const row = existing
      ? await tx.ssoConnection.update({ where: { id: existing.id }, data: fields, select: { id: true } })
      : await tx.ssoConnection.create({ data: { organizationId: org.id, ...fields, clientCiphertext: fields.clientCiphertext! }, select: { id: true } })
    await tx.ssoGroupMapping.deleteMany({ where: { connectionId: row.id } })
    if (input.mappings.length > 0) await tx.ssoGroupMapping.createMany({ data: input.mappings.map((m) => ({ connectionId: row.id, group: m.group, role: m.role })), skipDuplicates: true })
  })
  await recordAudit({
    userId: actorId, organizationId: org.id, action: 'sso.connection', entityType: 'organization', entityId: org.id,
    // The issuer host and the switches; never the client id or secret.
    metadata: { issuer: safeHost(input.issuer), ssoOnly: input.ssoOnly, defaultRole: input.defaultRole, mappings: input.mappings.length, secretRotated: Boolean(input.clientSecret) }, ip,
  })
  return { kind: 'ok' }
}

export async function removeConnection(actorId: string, org: OrgScope, ip: string | null): Promise<boolean> {
  const removed = await prisma.ssoConnection.deleteMany({ where: { organizationId: org.id } })
  if (removed.count === 0) return false
  await recordAudit({ userId: actorId, organizationId: org.id, action: 'sso.connection', entityType: 'organization', entityId: org.id, metadata: { removed: true }, ip })
  return true
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}
