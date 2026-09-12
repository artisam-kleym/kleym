/**
 * Account linking and provisioning. Issue #46.
 *
 * An IdP identity links to a Kleym user on the STABLE SUBJECT only —
 * `SsoIdentity(connectionId, subject)`. Never on an email address: an IdP
 * that lets a user set an unverified email, matched against an existing
 * Kleym account, is an account takeover. So:
 *
 * - identity known → that user.
 * - identity unknown, and an existing user's name matches the asserted
 *   email → REFUSED (`link-required`): the user signs in with their
 *   password and links from Settings, which runs the flow as `link`.
 * - identity unknown, nobody matches → provisioned: a new user with an
 *   unusable password, a membership at the mapped role, the identity.
 *
 * SCIM-provisioned users carry an identity with subject `externalId`, which
 * is what the IdP also asserts in the configured subject claim (Okta `sub`,
 * Entra `oid`) — so SCIM and OIDC meet on the same stable identifier, not on
 * an email.
 */
import { randomBytes } from 'node:crypto'
import type { OrgRole } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { hashPassword } from '@/lib/auth/password'
import { recordAudit } from '@/lib/api/audit'
import { ROLE_ORDER } from '@/lib/api/session-guard'

export interface RoleSource {
  defaultRole: OrgRole
  mappings: { group: string; role: OrgRole }[]
}

/** The highest mapped role among the groups; the default when none matches. */
export function roleFor(groups: string[], source: RoleSource): OrgRole {
  let best: OrgRole | null = null
  for (const m of source.mappings) {
    if (groups.includes(m.group) && (best === null || ROLE_ORDER.indexOf(m.role) > ROLE_ORDER.indexOf(best))) best = m.role
  }
  return best ?? source.defaultRole
}

export type ResolveOutcome =
  | { kind: 'ok'; userId: string; provisioned: boolean }
  | { kind: 'link-required' }
  | { kind: 'inactive' }

/** A username for a provisioned user: the email when free, otherwise a derived one. */
async function usernameFor(email: string | null, subject: string): Promise<string> {
  const base = (email ?? `sso-${subject}`).toLowerCase().replace(/[^a-z0-9._@-]/g, '-').slice(0, 56)
  for (let i = 0; i < 5; i += 1) {
    const candidate = i === 0 ? base : `${base.slice(0, 50)}-${randomBytes(2).toString('hex')}`
    if (!(await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } }))) return candidate
  }
  return `sso-${randomBytes(8).toString('hex')}`
}

export async function resolveIdentity(
  connection: { id: string; organizationId: string } & RoleSource,
  claims: { subject: string; email: string | null; emailVerified: boolean; groups: string[] },
  ip: string | null,
  now = new Date(),
): Promise<ResolveOutcome> {
  const role = roleFor(claims.groups, connection)
  const identity = await prisma.ssoIdentity.findUnique({
    where: { connectionId_subject: { connectionId: connection.id, subject: claims.subject } },
    select: { userId: true, user: { select: { isActive: true } } },
  })
  if (identity) {
    if (!identity.user.isActive) return { kind: 'inactive' }
    await prisma.$transaction([
      prisma.ssoIdentity.update({ where: { connectionId_subject: { connectionId: connection.id, subject: claims.subject } }, data: { lastLoginAt: now } }),
      // The role follows the groups on every sign-in: a group change is reflected next time.
      prisma.membership.upsert({
        where: { organizationId_userId: { organizationId: connection.organizationId, userId: identity.userId } },
        create: { userId: identity.userId, organizationId: connection.organizationId, role },
        update: { role },
      }),
    ])
    return { kind: 'ok', userId: identity.userId, provisioned: false }
  }

  // Unknown subject. A local account that LOOKS like this person is exactly
  // the case that must not auto-link — verified email or not.
  if (claims.email) {
    const collision = await prisma.user.findFirst({ where: { username: { equals: claims.email, mode: 'insensitive' } }, select: { id: true } })
    if (collision) {
      logger.warn({ connectionId: connection.id, verified: claims.emailVerified }, 'sso: identity matches a local account by email only; link refused')
      await recordAudit({ userId: null, organizationId: connection.organizationId, action: 'sso.link_refused', entityType: 'user', entityId: collision.id, metadata: { reason: 'email-only match', emailVerified: claims.emailVerified }, ip })
      return { kind: 'link-required' }
    }
  }

  const user = await prisma.user.create({
    data: {
      username: await usernameFor(claims.email, claims.subject),
      // Unusable: nobody knows it. This account signs in through the IdP.
      passwordHash: await hashPassword(randomBytes(32).toString('hex')),
      role: 'SENDER',
      memberships: { create: { organizationId: connection.organizationId, role } },
      ssoIdentities: { create: { connectionId: connection.id, subject: claims.subject, lastLoginAt: now } },
    },
    select: { id: true },
  })
  await recordAudit({ userId: user.id, organizationId: connection.organizationId, action: 'sso.provisioned', entityType: 'user', entityId: user.id, metadata: { via: 'oidc', orgRole: role }, ip })
  logger.info({ userId: user.id, organizationId: connection.organizationId, orgRole: role }, 'sso: user provisioned')
  return { kind: 'ok', userId: user.id, provisioned: true }
}

/** The explicit link step: a signed-in user binds THIS identity to their own account. */
export async function linkIdentity(userId: string, connection: { id: string; organizationId: string } & RoleSource, claims: { subject: string; groups: string[] }, ip: string | null): Promise<{ kind: 'ok' } | { kind: 'taken' }> {
  const existing = await prisma.ssoIdentity.findUnique({ where: { connectionId_subject: { connectionId: connection.id, subject: claims.subject } }, select: { userId: true } })
  if (existing && existing.userId !== userId) return { kind: 'taken' }
  const role = roleFor(claims.groups, connection)
  await prisma.$transaction([
    prisma.ssoIdentity.upsert({
      where: { connectionId_subject: { connectionId: connection.id, subject: claims.subject } },
      create: { userId, connectionId: connection.id, subject: claims.subject, lastLoginAt: new Date() },
      update: { lastLoginAt: new Date() },
    }),
    prisma.membership.upsert({
      where: { organizationId_userId: { organizationId: connection.organizationId, userId } },
      create: { userId, organizationId: connection.organizationId, role },
      update: { role },
    }),
  ])
  await recordAudit({ userId, organizationId: connection.organizationId, action: 'sso.linked', entityType: 'user', entityId: userId, metadata: {}, ip })
  return { kind: 'ok' }
}

/** Whether password sign-in is refused for this user: any SSO-only organisation they belong to. */
export async function ssoOnlyFor(userId: string): Promise<boolean> {
  const count = await prisma.membership.count({ where: { userId, organization: { sso: { ssoOnly: true } } } })
  return count > 0
}
