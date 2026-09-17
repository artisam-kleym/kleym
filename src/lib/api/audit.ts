/**
 * Audit logging. SPEC.md §5.4, AGENT.md §4.5.
 *
 * Every mutating action writes one row: who, what, which entity, from where.
 * The rows are read by a person after something has gone wrong, so the value
 * of this table depends entirely on it being complete AND on it being safe to
 * read — an audit log that has to be handled as a secret is one nobody opens.
 *
 * `metadata` is therefore SCRUBBED rather than trusted. Callers pass a small
 * record of primitives, and anything that looks like a credential is replaced
 * before it reaches the database. That is not a substitute for callers being
 * careful; it is the backstop for the one that is not.
 */
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { containsSecretSeed } from '@/lib/validation/stellar'
import { randomUUID } from 'node:crypto'
import { appendChained } from './audit-chain'

/** The actions SPEC.md §5.4 requires. A union so a typo is a build error. */
export type AuditAction =
  | 'campaign.create'
  | 'campaign.cancel'
  | 'campaign.suspend'
  | 'link.suspend'
  | 'campaign.approve'
  | 'campaign.reject'
  | 'campaign.screening'
  | 'org.screening_url'
  | 'org.webhook_add'
  | 'org.webhook_remove'
  | 'org.webhook_enable'
  | 'org.regulator_export'
  | 'org.receipts_export'
  | 'link.reclaim'
  | 'link.claim'
  | 'user.create'
  | 'user.revoke_invitation'
  | 'org.member_add'
  | 'org.member_role'
  | 'org.member_remove'
  | 'org.rename'
  | 'org.approval_policy'
  | 'user.activate'
  | 'user.deactivate'
  | 'auth.password_change'
  | 'apikey.create'
  | 'apikey.revoke'
  | 'security.seed_submitted'
  | 'sso.provisioned'
  | 'sso.linked'
  | 'sso.link_refused'
  | 'sso.login'
  | 'sso.connection'
  | 'scim.token_issued'
  | 'scim.user_created'
  | 'scim.user_deactivated'
  | 'scim.user_updated'
  | 'scim.group_synced'
  | 'mfa.totp_enrolled'
  | 'mfa.totp_removed'
  | 'mfa.passkey_added'
  | 'mfa.passkey_removed'
  | 'mfa.recovery_code_used'
  | 'mfa.verified'
  | 'mfa.step_up'
  | 'org.mfa_policy'
  | 'privacy.retention'
  | 'privacy.erasure'

export type AuditValue = string | number | boolean | null

export interface AuditEntry {
  userId: string | null
  /** The organisation the action happened in; null when there is none (staff acting on a user). */
  organizationId?: string | null
  action: AuditAction
  entityType?: string
  entityId?: string
  metadata?: Record<string, AuditValue>
  ip: string | null
}

export const REDACTED = '[redacted]'

/**
 * Field names whose VALUES are never audit metadata, whatever they hold.
 *
 * Matched on the key rather than the value, because a session token and an API
 * key are both just opaque strings — there is no pattern to recognise them by
 * once they are out of context.
 *
 * SUBSTRING matching over the flattened key for the credential words: `seed`,
 * `secret`, `password`, `token`, `otp`, `apikey`, `privatekey`… are credentials
 * wherever they appear, so `otpCode`, `session_token`, `newPassword`,
 * `passwordhash`, `APIKEY` and `sessiontoken` are all caught, however the
 * caller spelled them. A whole-segment rule was tried and dropped: it let every
 * run-together spelling (`apikey`, `privatekey`, `sessiontoken`) through.
 *
 * `code` is the one word that is also ordinary English. As a substring it
 * redacted `assetCode`, `statusCode`, `resultCode` and `countryCode` and fired
 * the credential alarm on a normal campaign creation — so it matches only a
 * field named exactly `code`, which is an OTP; `otpCode` is caught by `otp`.
 */
const FORBIDDEN_SUBSTRINGS = [
  'seed', 'secret', 'password', 'passwd', 'token', 'otp', 'apikey', 'privatekey',
  'authorization', 'cookie', 'signature',
  // A recipient's address is PII with a lifecycle (#50); an audit row must
  // not become the copy that outlives the erasure it records.
  'email',
]
const FORBIDDEN_EXACT = new Set(['code'])

export function isForbiddenKey(key: string): boolean {
  const flat = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (FORBIDDEN_SUBSTRINGS.some((word) => flat.includes(word))) return true
  return FORBIDDEN_EXACT.has(flat)
}

/**
 * Metadata with anything credential-shaped removed.
 *
 * Two independent rules, because either alone has a hole: the key rule catches
 * an opaque token that no pattern would recognise, and the value rule catches
 * a seed hiding under an innocent key like `note` or `label`.
 */
export function scrubMetadata(
  metadata: Record<string, AuditValue> | undefined,
): { clean: Record<string, AuditValue>; removed: string[] } {
  if (!metadata) return { clean: {}, removed: [] }

  const clean: Record<string, AuditValue> = {}
  const removed: string[] = []

  for (const [key, value] of Object.entries(metadata)) {
    const suspiciousKey = isForbiddenKey(key)
    const suspiciousValue = typeof value === 'string' && containsSecretSeed(value)

    if (suspiciousKey || suspiciousValue) {
      clean[key] = REDACTED
      removed.push(key)
      continue
    }
    clean[key] = value
  }

  return { clean, removed }
}

/**
 * Writes one audit row.
 *
 * Never throws. An audit write that fails must not take down the action it is
 * recording — a campaign that was created is created whether or not the log
 * line landed, and turning a logging failure into a 500 would tell the sender
 * their campaign failed when it did not. The failure is logged loudly instead,
 * because a silently missing audit trail is its own incident.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  const { clean, removed } = scrubMetadata(entry.metadata)

  if (removed.length > 0) {
    /*
     * A caller tried to audit a credential. The names are logged, never the
     * values — this line exists so the offending call site gets fixed.
     */
    logger.error(
      { action: entry.action, fields: removed },
      'audit metadata contained credential-shaped fields; they were redacted',
    )
  }

  /*
   * Chained (#49): the row takes the next seq under the head lock, so a
   * concurrent writer waits rather than forks. The lock serialises without a
   * retry loop, which is what keeps the never-throw contract simple — the
   * only way to lose a row is the database refusing the write outright, and
   * that is logged at ERROR as the incident it is.
   */
  try {
    await appendChained({
      id: randomUUID(),
      userId: entry.userId,
      organizationId: entry.organizationId ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      metadata: Object.keys(clean).length > 0 ? (clean as Prisma.InputJsonValue) : Prisma.JsonNull,
      ip: entry.ip,
    })
  } catch (error) {
    logger.error(
      { securityEvent: 'AUDIT_ROW_DROPPED', action: entry.action, reason: error instanceof Error ? error.message : 'unknown' },
      'audit row could not be written',
    )
  }
}

export interface AuditQuery {
  userId?: string
  /** "What happened in my organisation" — the question a customer's auditor asks. */
  organizationId?: string
  action?: string
  entityType?: string
  entityId?: string
  from?: Date
  to?: Date
  page?: number
  perPage?: number
}

export interface AuditPage {
  rows: {
    id: string
    createdAt: Date
    action: string
    entityType: string | null
    entityId: string | null
    ip: string | null
    username: string | null
    organization: string | null
    metadata: unknown
  }[]
  total: number
  page: number
  perPage: number
  pages: number
}

/** The `/admin/audit` viewer's query. Filters compose; all are optional. */
export async function queryAudit(query: AuditQuery = {}): Promise<AuditPage> {
  const perPage = Math.min(Math.max(query.perPage ?? 50, 1), 200)
  const page = Math.max(query.page ?? 1, 1)

  const where = {
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      /*
       * `id` breaks ties on `createdAt`.
       *
       * Several rows can share a timestamp — a batch of API key revocations
       * lands inside one transaction — and an unstable sort makes a paged walk
       * skip and repeat rows. The same trap LINK_ORDER exists for.
       */
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, createdAt: true, action: true, entityType: true,
        entityId: true, ip: true, metadata: true,
        user: { select: { username: true } },
        organization: { select: { name: true } },
      },
    }),
  ])

  return {
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      ip: row.ip,
      username: row.user?.username ?? null,
      organization: row.organization?.name ?? null,
      metadata: row.metadata,
    })),
    total,
    page,
    perPage,
    pages: Math.max(1, Math.ceil(total / perPage)),
  }
}

/** The distinct actions present, for the viewer's filter. */
export async function auditActions(): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    distinct: ['action'],
    select: { action: true },
    orderBy: { action: 'asc' },
  })
  return rows.map((row) => row.action)
}
