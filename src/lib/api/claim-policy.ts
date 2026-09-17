/**
 * Claim policies (#79): who may claim a link.
 *
 * The OTP gate (#14) bound an EMAILED link to the address Kleym mailed it
 * to. This generalises that seam — one function, applied on every claim
 * action, returning null or a refusal — to four policies:
 *
 *   OPEN     whoever holds the link (SPEC.md §12's bearer instrument)
 *   CODE     a per-link code the sender distributes through a second channel
 *   EMAIL    the OTP gate; the link must have been emailed by Kleym
 *   PASSKEY  the first claimant registers a WebAuthn credential and the link
 *            is bound to that device
 *
 * None of these identifies a person. Recipients are anonymous by design;
 * a policy binds a link to a channel or a device, not to a legal identity.
 *
 * Every policy ends in the same place: a short-lived TOKEN in Redis, scoped
 * to one link, carried in a header (`x-kleym-otp`, kept for the page and the
 * routes that already send it). The gate checks the token; how it was earned
 * — code, email OTP, passkey — is the policy's business.
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import type { ClaimPolicy as PrismaClaimPolicy } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { redis } from '@/lib/redis/client'
import { logger } from '@/lib/config/logger'
import { OTP_MAX_ATTEMPTS, otpSatisfied } from './otp'
import { claimConflict } from './claim-problems'
import type { ClaimConflictReason } from '@/lib/claim/problem-types'

export type ClaimPolicy = 'open' | 'code' | 'email' | 'passkey'
export const CLAIM_POLICIES: readonly ClaimPolicy[] = ['open', 'code', 'email', 'passkey'] as const

export function policyFromRow(row: PrismaClaimPolicy): ClaimPolicy {
  return row.toLowerCase() as ClaimPolicy
}
export function policyToRow(policy: ClaimPolicy): PrismaClaimPolicy {
  return policy.toUpperCase() as PrismaClaimPolicy
}

/** The header the token travels in. The OTP's, kept: three routes and the page already send it. */
export const POLICY_TOKEN_HEADER = 'x-kleym-otp'

/* ── the token store, shared by every policy ─────────────────────────── */

const TOKEN_TTL_SECONDS = 30 * 60
const tokenKey = (token: string) => `claim:token:${createHash('sha256').update(token).digest('hex')}`

/** Opaque, stored hashed, scoped to one link, thirty minutes — a session's shape (AGENT.md §5.1). */
export async function issueClaimToken(linkId: string): Promise<string> {
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
  await redis.set(tokenKey(token), linkId, 'EX', TOKEN_TTL_SECONDS)
  return token
}

/** Fails CLOSED when Redis is unreachable, like the rate limiter. */
export async function claimTokenSatisfied(linkId: string, token: string | null): Promise<boolean> {
  if (!token) return false
  try {
    const held = await redis.get(tokenKey(token))
    if (!held) return false
    const a = Buffer.from(held)
    const b = Buffer.from(linkId)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch (error) {
    logger.error({ reason: error instanceof Error ? error.message : 'unknown' }, 'claim token store unavailable; denying')
    return false
  }
}

/* ── the gate ────────────────────────────────────────────────────────── */

export interface PolicyRefusal {
  reason: ClaimConflictReason
  detail: string
}

/** Which policy applies to this link, and what it needs. Null for an unknown key: the routes 404 that themselves. */
export async function policyFor(ephemeralPublicKey: string): Promise<{ linkId: string; policy: ClaimPolicy; emailed: boolean } | null> {
  const link = await prisma.claimLink.findUnique({
    where: { ephemeralPublicKey },
    select: { id: true, campaign: { select: { claimPolicy: true } }, delivery: { select: { id: true } } },
  })
  if (!link) return null
  return { linkId: link.id, policy: policyFromRow(link.campaign.claimPolicy), emailed: link.delivery !== null }
}

/**
 * Decides, pure given the facts: does this request satisfy the link's policy?
 * `emailedOtp` is the legacy OTP token check; `token` the policy token check.
 */
export function policyDecision(
  policy: ClaimPolicy,
  facts: { emailed: boolean; tokenOk: boolean; otpOk: boolean },
): PolicyRefusal | null {
  switch (policy) {
    case 'open':
      /*
       * An OPEN campaign whose link was nonetheless emailed keeps the OTP gate:
       * that is #14's behaviour, unchanged — the address is a channel Kleym
       * does not control, so the code re-binds the URL to it.
       */
      if (facts.emailed && !facts.otpOk) {
        return { reason: 'otp-required', detail: 'This link was sent by email, so it needs the six-digit code from that message.' }
      }
      return null
    case 'email':
      if (!facts.emailed) {
        // Not "enter the code": there is no code coming. The page shows this as a dead end, not an OTP panel.
        return { reason: 'email-only', detail: 'This link can only be claimed from the email it is sent in. Ask the sender to send it.' }
      }
      if (!facts.otpOk) {
        return { reason: 'otp-required', detail: 'This link was sent by email, so it needs the six-digit code from that message.' }
      }
      return null
    case 'code':
    case 'passkey': {
      /*
       * The policy token stands for BOTH factors on an emailed link: the
       * code/passkey routes refuse to issue it until the OTP is satisfied
       * (`emailedFirst`), so a forwarded email cannot bind or claim without
       * holding the address. Before the token exists the OTP is asked for
       * first, so the page walks the gates in delivery order.
       */
      if (facts.tokenOk) return null
      if (facts.emailed && !facts.otpOk) {
        return { reason: 'otp-required', detail: 'This link was sent by email, so it needs the six-digit code from that message first.' }
      }
      return policy === 'code'
        ? { reason: 'code-required', detail: 'This link needs the claim code the sender gave you separately.' }
        : { reason: 'passkey-required', detail: 'This link is bound to a passkey. Register one on first claim, or use the device you registered.' }
    }
  }
}

/**
 * The first factor on an emailed CODE/PASSKEY link (#14 + #79): the OTP
 * token must be on the request before a code or passkey may earn the policy
 * token. Null when the link was never emailed, or the OTP is satisfied.
 */
export async function emailedFirst(ephemeralPublicKey: string, request: Request): Promise<PolicyRefusal | null> {
  const found = await policyFor(ephemeralPublicKey)
  if (!found || !found.emailed) return null
  if (await otpSatisfied(ephemeralPublicKey, request.headers.get(POLICY_TOKEN_HEADER))) return null
  return { reason: 'otp-required', detail: 'This link was sent by email, so it needs the six-digit code from that message first.' }
}

/**
 * Null when the request may proceed, a Response when it may not. Applied on
 * every claim ACTION — materialise, claim, submit — not only the first:
 * gating just the first would let a caller skip to the one that moves the
 * money. An unknown key passes here so the route can answer its own 404 —
 * a differential refusal from the gate would be an oracle.
 */
export async function claimPolicyGate(request: Request, ephemeralPublicKey: string): Promise<Response | null> {
  const found = await policyFor(ephemeralPublicKey)
  if (!found) return null
  const token = request.headers.get(POLICY_TOKEN_HEADER)
  const [tokenOk, otpOk] = await Promise.all([
    claimTokenSatisfied(found.linkId, token),
    found.emailed ? otpSatisfied(ephemeralPublicKey, token) : Promise.resolve(false),
  ])
  const refusal = policyDecision(found.policy, { emailed: found.emailed, tokenOk, otpOk })
  return refusal ? claimConflict(refusal.detail, refusal.reason) : null
}

/* ── the CODE policy ─────────────────────────────────────────────────── */

/** Crockford base32, no vowels' lookalikes: 13 characters is 65 bits. Written in the sender's CSV. */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_LENGTH = 13
export const CODE_LOCK_MS = 15 * 60_000

export function isClaimCode(value: string): boolean {
  return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(normaliseCode(value))
}

/** Case-folded, with the separators and lookalikes people type corrected. */
export function normaliseCode(value: string): string {
  return value.toUpperCase().replace(/[-\s]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
}

/**
 * SHA-256, not argon2id. The OTP is six digits and NEEDS a slow hash; this
 * code carries 65 bits of entropy, which no offline attack on a fast hash
 * reaches, and a 10,000-link registration cannot afford ten thousand argon2
 * rounds in one request. The attempt counter and lockout are the OTP's.
 */
export function hashClaimCode(code: string): string {
  return createHash('sha256').update(normaliseCode(code)).digest('hex')
}

export type CodeVerify =
  | { ok: true; token: string }
  | { ok: false; reason: 'wrong' | 'locked' | 'not-code-policy'; attemptsLeft: number; retryAfterSeconds?: number }

/** Hashed, so the key names neither the address nor the link in the clear. */
const attemptsKey = (linkId: string, ip: string | null) =>
  `claim:code:attempts:${createHash('sha256').update(`${linkId}\n${ip ?? ''}`).digest('hex')}`

/**
 * Checks a claim code. Guesses are counted per LINK AND CALLER, atomically
 * (`INCR`, with the lock window as TTL), BEFORE the comparison — a request
 * abandoned mid-check has still been counted — and the fifth wrong guess
 * from one caller locks that caller out of that link for fifteen minutes.
 *
 * Per caller, not per link: the ephemeral key is the balance's claimant on
 * the public ledger, so a per-link lock could be held shut indefinitely by
 * anyone reading Horizon, and the sender has no reissue that would clear it.
 * Sixty-five bits of code means brute force across callers is not a concern
 * the lock has to carry.
 */
export async function verifyClaimCode(ephemeralPublicKey: string, code: string, ip: string | null): Promise<CodeVerify> {
  const link = await prisma.claimLink.findUnique({
    where: { ephemeralPublicKey },
    select: { id: true, codeHash: true, campaign: { select: { claimPolicy: true } } },
  })
  if (!link || link.campaign.claimPolicy !== 'CODE' || !link.codeHash) {
    return { ok: false, reason: 'not-code-policy', attemptsLeft: 0 }
  }

  const key = attemptsKey(link.id, ip)
  const attempts = await redis.incr(key)
  if (attempts === 1) await redis.pexpire(key, CODE_LOCK_MS)
  if (attempts > OTP_MAX_ATTEMPTS) {
    const ttl = await redis.pttl(key)
    return { ok: false, reason: 'locked', attemptsLeft: 0, retryAfterSeconds: Math.max(1, Math.ceil((ttl > 0 ? ttl : CODE_LOCK_MS) / 1000)) }
  }

  const a = Buffer.from(hashClaimCode(code), 'hex')
  const b = Buffer.from(link.codeHash, 'hex')
  const match = a.length === b.length && timingSafeEqual(a, b)
  if (!match) {
    const left = OTP_MAX_ATTEMPTS - attempts
    if (left === 0) {
      logger.warn({ linkId: link.id }, 'claim code locked for this caller after too many attempts')
      return { ok: false, reason: 'locked', attemptsLeft: 0, retryAfterSeconds: CODE_LOCK_MS / 1000 }
    }
    return { ok: false, reason: 'wrong', attemptsLeft: left }
  }

  await redis.del(key)
  return { ok: true, token: await issueClaimToken(link.id) }
}
