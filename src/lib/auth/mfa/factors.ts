/**
 * A sender's second factors. Issue #47.
 *
 * The patterns are lib/api/otp.ts's, reused for the sender: argon2id with the
 * password parameters for anything hashed at rest, the attempt counter
 * incremented BEFORE the comparison, the same bound and lockout, constant-time
 * comparison, and recovery codes that are single-use and destroyed on use.
 */
import argon2 from 'argon2'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db/client'
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'
import { recordAudit } from '@/lib/api/audit'
import { decryptSecret, encryptSecret } from './crypto'
import { generateTotpKey, otpauthUri, totpMatches } from './totp'

/** OWASP-aligned; matches lib/auth/password.ts and prisma/seed.ts. Change all together. */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const

export const MFA_MAX_ATTEMPTS = 5
export const MFA_LOCKOUT_MS = 15 * 60 * 1000
export const RECOVERY_CODES = 8

export interface FactorSummary {
  totp: { confirmedAt: Date } | null
  passkeys: { id: string; name: string; createdAt: Date; lastUsedAt: Date | null }[]
  recoveryCodesLeft: number
}

export async function factorsOf(userId: string): Promise<FactorSummary> {
  const [totp, passkeys, recovery] = await Promise.all([
    prisma.mfaTotp.findUnique({ where: { userId, confirmedAt: { not: null } }, select: { confirmedAt: true } }),
    prisma.mfaPasskey.findMany({ where: { userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, name: true, createdAt: true, lastUsedAt: true } }),
    prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } }),
  ])
  return { totp: totp?.confirmedAt ? { confirmedAt: totp.confirmedAt } : null, passkeys, recoveryCodesLeft: recovery }
}

/** Has a confirmed second factor of any kind. */
export async function hasFactor(userId: string): Promise<boolean> {
  const [totp, passkeys] = await Promise.all([
    prisma.mfaTotp.count({ where: { userId, confirmedAt: { not: null } } }),
    prisma.mfaPasskey.count({ where: { userId } }),
  ])
  return totp + passkeys > 0
}

/* ── TOTP ──────────────────────────────────────────────────────────────── */

/**
 * Starts (or restarts) enrolment: a fresh key, stored encrypted and
 * UNCONFIRMED. The key is returned once for the authenticator app; a
 * confirmed factor is never replaced by this — remove it first.
 */
export async function beginTotpEnrolment(userId: string, username: string): Promise<{ kind: 'already-enrolled' } | { kind: 'ok'; keyBase32: string; otpauth: string }> {
  const existing = await prisma.mfaTotp.findUnique({ where: { userId }, select: { confirmedAt: true } })
  if (existing?.confirmedAt) return { kind: 'already-enrolled' }
  const keyBase32 = generateTotpKey()
  await prisma.mfaTotp.upsert({
    where: { userId },
    create: { userId, ciphertext: encryptSecret(keyBase32) },
    update: { ciphertext: encryptSecret(keyBase32), attempts: 0, lockedUntil: null },
  })
  return { kind: 'ok', keyBase32, otpauth: otpauthUri(env.WEBAUTHN_RP_NAME, username, keyBase32) }
}

export type CodeCheck =
  | { ok: true; via: 'totp' | 'recovery' }
  | { ok: false; reason: 'wrong' | 'locked' | 'none' ; attemptsLeft: number }

/**
 * Confirms an unconfirmed enrolment with one code from the app, issues the
 * recovery codes (returned ONCE, stored hashed), audits.
 */
export async function confirmTotpEnrolment(userId: string, code: string, ip: string | null, now = new Date()): Promise<{ kind: 'none' } | { kind: 'wrong'; attemptsLeft: number } | { kind: 'locked' } | { kind: 'ok'; recoveryCodes: string[] }> {
  const row = await prisma.mfaTotp.findUnique({ where: { userId }, select: { ciphertext: true, confirmedAt: true } })
  if (!row || row.confirmedAt) return { kind: 'none' }
  const check = await checkTotp(userId, code, now)
  if (!check.ok) return check.reason === 'locked' ? { kind: 'locked' } : check.reason === 'none' ? { kind: 'none' } : { kind: 'wrong', attemptsLeft: check.attemptsLeft }
  await prisma.mfaTotp.update({ where: { userId }, data: { confirmedAt: now, attempts: 0, lockedUntil: null } })
  const recoveryCodes = await issueRecoveryCodes(userId)
  await recordAudit({ userId, action: 'mfa.totp_enrolled', entityType: 'user', entityId: userId, metadata: {}, ip })
  logger.info({ userId }, 'mfa: totp enrolled')
  return { kind: 'ok', recoveryCodes }
}

/**
 * One TOTP guess. The attempt is counted BEFORE the comparison; the fifth
 * wrong guess locks the factor for fifteen minutes. Lockout is checked
 * first, so a locked factor reads as locked and never as "wrong".
 */
export async function checkTotp(userId: string, code: string, now = new Date()): Promise<CodeCheck> {
  const row = await prisma.mfaTotp.findUnique({ where: { userId }, select: { ciphertext: true, attempts: true, lockedUntil: true } })
  if (!row) return { ok: false, reason: 'none', attemptsLeft: 0 }
  if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) return { ok: false, reason: 'locked', attemptsLeft: 0 }

  // Counted first. A guess whose connection dies mid-check has still been made.
  const { attempts } = await prisma.mfaTotp.update({
    where: { userId },
    data: row.lockedUntil ? { attempts: 1, lockedUntil: null } : { attempts: { increment: 1 } },
    select: { attempts: true },
  })
  const matched = totpMatches(decryptSecret(row.ciphertext), code, now)
  if (matched === null) {
    const left = Math.max(0, MFA_MAX_ATTEMPTS - attempts)
    if (left === 0) {
      await prisma.mfaTotp.update({ where: { userId }, data: { lockedUntil: new Date(now.getTime() + MFA_LOCKOUT_MS) } })
      logger.warn({ userId }, 'mfa: totp locked after too many attempts')
      return { ok: false, reason: 'locked', attemptsLeft: 0 }
    }
    return { ok: false, reason: 'wrong', attemptsLeft: left }
  }
  await prisma.mfaTotp.update({ where: { userId }, data: { attempts: 0, lockedUntil: null } })
  return { ok: true, via: 'totp' }
}

/**
 * A code is a TOTP code (six digits) or a recovery code (xxxx-xxxx-xxxx).
 * Recovery codes are tried only when the TOTP factor is not the match, and
 * a wrong recovery code is a TOTP attempt too — one counter, one lockout.
 */
export async function checkCode(userId: string, code: string, ip: string | null, now = new Date()): Promise<CodeCheck> {
  const trimmed = code.trim()
  if (/^\d{6}$/.test(trimmed)) return checkTotp(userId, trimmed, now)
  if (/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(trimmed)) {
    // Bounded by the TOTP counter: a wrong recovery code costs an attempt.
    const gate = await prisma.mfaTotp.findUnique({ where: { userId }, select: { attempts: true, lockedUntil: true } })
    if (gate?.lockedUntil && gate.lockedUntil.getTime() > now.getTime()) return { ok: false, reason: 'locked', attemptsLeft: 0 }
    const used = await consumeRecoveryCode(userId, trimmed.toLowerCase(), ip, now)
    if (used) return { ok: true, via: 'recovery' }
    if (gate) {
      const { attempts } = await prisma.mfaTotp.update({ where: { userId }, data: { attempts: { increment: 1 } }, select: { attempts: true } })
      const left = Math.max(0, MFA_MAX_ATTEMPTS - attempts)
      if (left === 0) {
        await prisma.mfaTotp.update({ where: { userId }, data: { lockedUntil: new Date(now.getTime() + MFA_LOCKOUT_MS) } })
        return { ok: false, reason: 'locked', attemptsLeft: 0 }
      }
      return { ok: false, reason: 'wrong', attemptsLeft: left }
    }
    return { ok: false, reason: 'wrong', attemptsLeft: 0 }
  }
  return { ok: false, reason: 'wrong', attemptsLeft: 0 }
}

/** Removes the TOTP factor and every recovery code. */
export async function removeTotp(userId: string, ip: string | null): Promise<void> {
  await prisma.$transaction([prisma.mfaTotp.deleteMany({ where: { userId } }), prisma.mfaRecoveryCode.deleteMany({ where: { userId } })])
  await recordAudit({ userId, action: 'mfa.totp_removed', entityType: 'user', entityId: userId, metadata: {}, ip })
}

/* ── recovery codes ────────────────────────────────────────────────────── */

function formatRecoveryCode(): string {
  const raw = randomBytes(9).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(12, '7').slice(0, 12)
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

/** Replaces the set. Returned ONCE; only hashes are kept. */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODES }, formatRecoveryCode)
  const hashes = await Promise.all(codes.map((c) => argon2.hash(c, OPTIONS)))
  await prisma.$transaction([
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.mfaRecoveryCode.createMany({ data: hashes.map((codeHash) => ({ userId, codeHash })) }),
  ])
  return codes
}

/**
 * Uses a recovery code: matched against the unused hashes, marked used in
 * the same statement that checks it is still unused (no double spend under
 * concurrency), audited at WARN — a recovery code in use means a factor is
 * gone or a device is.
 */
async function consumeRecoveryCode(userId: string, code: string, ip: string | null, now: Date): Promise<boolean> {
  const unused = await prisma.mfaRecoveryCode.findMany({ where: { userId, usedAt: null }, select: { id: true, codeHash: true } })
  for (const candidate of unused) {
    if (await argon2.verify(candidate.codeHash, code).catch(() => false)) {
      const spent = await prisma.mfaRecoveryCode.updateMany({ where: { id: candidate.id, usedAt: null }, data: { usedAt: now } })
      if (spent.count === 0) return false
      const left = await prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } })
      logger.warn({ userId, recoveryCodesLeft: left }, 'mfa: recovery code used')
      await recordAudit({ userId, action: 'mfa.recovery_code_used', entityType: 'user', entityId: userId, metadata: { recoveryCodesLeft: left, severity: 'warn' }, ip })
      return true
    }
  }
  return false
}
