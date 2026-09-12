/**
 * User provisioning by invitation. SPEC.md §5.4, issue #39.
 *
 * THE ADMIN NEVER SETS THE PASSWORD. An admin who chooses one knows a
 * credential that can move a treasury and has to transmit it somewhere. What
 * an admin gets instead is a single-use, time-bounded URL; the user sets
 * their own password at the other end of it, through the same argon2id path
 * a password change uses.
 *
 * The token follows the OTP token in lib/api/otp.ts and the session cookie:
 * opaque, from a CSPRNG, stored only as a SHA-256 hash, compared by lookup on
 * that hash. The plaintext exists in the URL handed to the admin, once, and
 * in nothing Kleym persists or logs.
 *
 * Until it is redeemed the account is INACTIVE with an unguessable password,
 * so it cannot sign in — `isActive` is what login and `getSessionUser` check.
 */
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { env } from '@/lib/config/env'
import { hashPassword } from '@/lib/auth/password'
import { isUniqueViolation } from '@/lib/db/errors'
import { recordAudit } from './audit'

/** Three days: long enough to cross a weekend, short enough not to be a standing key. */
export const INVITATION_TTL_MS = 3 * 24 * 60 * 60 * 1000

export const createUserSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'at least 3 characters')
      .max(64)
      .regex(/^[a-z0-9][a-z0-9._-]*$/i, 'letters, digits, dot, underscore or dash'),
    role: z.enum(['SENDER', 'ADMIN']).default('SENDER'),
  })
  .strict()
export type CreateUserInput = z.infer<typeof createUserSchema>

export const redeemSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/, 'malformed'),
    // Same floor as a password change (api/auth/password).
    password: z.string().min(12, 'must be at least 12 characters').max(512),
  })
  .strict()

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export type CreateOutcome =
  | { kind: 'ok'; user: { id: string; username: string; role: string }; inviteUrl: string; expiresAt: Date }
  | { kind: 'conflict'; detail: string }

/**
 * Creates an inactive account and its invitation. Returns the URL ONCE.
 *
 * The audit row names the actor and the new user; it carries no token. The
 * scrubber in lib/api/audit.ts would redact a `token` key anyway — but the
 * right number of places for the plaintext to be is one, and it is the
 * response body.
 */
export async function createInvitedUser(
  actorId: string,
  input: CreateUserInput,
  ip: string | null,
  now: Date = new Date(),
): Promise<CreateOutcome> {
  const taken = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true } })
  if (taken) return { kind: 'conflict', detail: `${input.username} is already taken.` }

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS)

  // An unguessable placeholder. Nobody knows it, so nothing can sign in with
  // it; redemption replaces it. Hashed like any password so a leaked column
  // still reveals nothing.
  const placeholder = await hashPassword(randomBytes(32).toString('hex'))

  let user: { id: string; username: string; role: string }
  try {
    user = await prisma.user.create({
      data: {
        username: input.username,
        role: input.role,
        passwordHash: placeholder,
        isActive: false,
        invitations: { create: { createdById: actorId, tokenHash: hashToken(token), expiresAt } },
      },
      select: { id: true, username: true, role: true },
    })
  } catch (error) {
    // Two admins inviting the same name at once: the loser of the unique
    // index gets the same answer as the findUnique above, not a 500.
    if (isUniqueViolation(error)) return { kind: 'conflict', detail: `${input.username} is already taken.` }
    throw error
  }

  await recordAudit({
    userId: actorId,
    action: 'user.create',
    entityType: 'user',
    entityId: user.id,
    metadata: { username: user.username, role: user.role, invitationExpires: expiresAt.toISOString() },
    ip,
  })
  logger.info({ actorId, userId: user.id, role: user.role }, 'user invited')

  return { kind: 'ok', user, inviteUrl: inviteUrl(token), expiresAt }
}

export function inviteUrl(token: string): string {
  return `${env.APP_URL.replace(/\/$/, '')}/invite/${token}`
}

export type RedeemOutcome = { kind: 'ok'; username: string } | { kind: 'invalid' }

/**
 * Redeems an invitation: sets the password, activates the account, spends
 * the token. ONE outcome for unknown, expired, already-redeemed and revoked
 * (a revoked invitation is deleted, so it IS unknown) — an attacker probing
 * tokens learns nothing from the shape of the refusal, and a legitimate user
 * with a stale link is told the same thing in every case: ask the admin for
 * a new one.
 */
export async function redeemInvitation(
  token: string,
  password: string,
  now: Date = new Date(),
): Promise<RedeemOutcome> {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, expiresAt: true, redeemedAt: true, user: { select: { id: true, username: true } } },
  })
  if (!invitation || invitation.redeemedAt || invitation.expiresAt.getTime() <= now.getTime()) {
    return { kind: 'invalid' }
  }

  const passwordHash = await hashPassword(password)

  /*
   * The spend is conditional on `redeemedAt` still being null INSIDE the
   * transaction, so two concurrent redemptions of one token cannot both set a
   * password: the second updateMany matches zero rows and the whole thing
   * rolls back.
   */
  const spent = await prisma.$transaction(async (tx) => {
    const { count } = await tx.invitation.updateMany({
      where: { id: invitation.id, redeemedAt: null },
      data: { redeemedAt: now },
    })
    if (count === 0) return false
    await tx.user.update({
      where: { id: invitation.user.id },
      data: { passwordHash, isActive: true, failedLogins: 0, lockedUntil: null },
    })
    return true
  })
  if (!spent) return { kind: 'invalid' }

  logger.info({ userId: invitation.user.id }, 'invitation redeemed')
  return { kind: 'ok', username: invitation.user.username }
}

/** For /admin/users: which accounts are still waiting on their invitation. */
export async function pendingInvitations(now: Date = new Date()): Promise<Map<string, Date>> {
  const rows = await prisma.invitation.findMany({
    where: { redeemedAt: null, expiresAt: { gt: now } },
    select: { userId: true, expiresAt: true },
  })
  return new Map(rows.map((row) => [row.userId, row.expiresAt]))
}

export type RevokeOutcome = { kind: 'ok'; username: string } | { kind: 'not-found' } | { kind: 'conflict'; detail: string }

/**
 * Revokes a pending invitation: deletes it AND the still-inactive account.
 *
 * The admin never holds a credential they cannot take back. A link sent to
 * the wrong person, or under the wrong username, must be revocable before it
 * expires — and until redemption the account has no other rows, so removing
 * it leaves nothing behind. Only an account that is inactive with an
 * unredeemed invitation qualifies; a redeemed one is deactivated instead
 * (`setUserActive`), which is a different action with a different audit row.
 */
export async function revokeInvitation(
  actorId: string,
  userId: string,
  ip: string | null,
): Promise<RevokeOutcome> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, isActive: true, invitations: { where: { redeemedAt: null }, select: { id: true } } },
  })
  if (!user) return { kind: 'not-found' }
  if (user.isActive || user.invitations.length === 0) {
    return { kind: 'conflict', detail: `${user.username} has already set a password; deactivate the account instead.` }
  }

  // The invitation goes with the user (onDelete: Cascade); a redeemed token
  // cannot reach here because `isActive` would be true.
  await prisma.user.delete({ where: { id: user.id } })

  await recordAudit({
    userId: actorId,
    action: 'user.revoke_invitation',
    entityType: 'user',
    entityId: user.id,
    metadata: { username: user.username },
    ip,
  })
  logger.info({ actorId, userId: user.id }, 'invitation revoked')
  return { kind: 'ok', username: user.username }
}
