/**
 * Step-up: a FRESH factor for the actions that move money. Issue #47.
 *
 * MFA at sign-in protects a session; MFA at batch signing protects the
 * money. With a twelve-hour session TTL, sign-in-only MFA means a laptop
 * stolen mid-session can still disburse. So batch signing, reclaim and API
 * key creation ask for a factor verified within the last five minutes,
 * regardless of session age — for any user who has a factor. A user with
 * none cannot step up, and is not asked to unless policy requires a factor,
 * in which case they cannot sign in at all until enrolled.
 */
import { prisma } from '@/lib/db/client'
import { recordAudit } from '@/lib/api/audit'
import { hasFactor } from './factors'

export const STEP_UP_MAX_AGE_SECONDS = 300

export type StepUpState = 'not-enrolled' | 'fresh' | 'required'

export async function stepUpState(userId: string, sessionId: string, now = new Date()): Promise<StepUpState> {
  if (!(await hasFactor(userId))) return 'not-enrolled'
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { stepUpAt: true } })
  const at = session?.stepUpAt?.getTime()
  return at !== undefined && now.getTime() - at <= STEP_UP_MAX_AGE_SECONDS * 1000 ? 'fresh' : 'required'
}

/** Null when the action may proceed; otherwise the state that blocks it. */
export async function stepUpGate(userId: string, sessionId: string, now = new Date()): Promise<'required' | null> {
  const state = await stepUpState(userId, sessionId, now)
  return state === 'required' ? 'required' : null
}

export async function markStepUp(userId: string, sessionId: string, via: 'totp' | 'recovery' | 'passkey', ip: string | null, now = new Date()): Promise<void> {
  await prisma.session.update({ where: { id: sessionId }, data: { stepUpAt: now } })
  await recordAudit({ userId, action: 'mfa.step_up', entityType: 'session', entityId: sessionId, metadata: { via }, ip })
}

/** Sign-in verification: unlocks the session, and counts as a fresh step-up too. */
export async function markMfaVerified(userId: string, sessionId: string, via: 'totp' | 'recovery' | 'passkey', ip: string | null, now = new Date()): Promise<void> {
  await prisma.session.update({ where: { id: sessionId }, data: { mfaAt: now, stepUpAt: now } })
  await recordAudit({ userId, action: 'mfa.verified', entityType: 'session', entityId: sessionId, metadata: { via }, ip })
}

/**
 * Adding a factor (#47 review): when the user already has one, adding
 * another takes a FRESH step-up — otherwise a hijacked session could enrol
 * its own authenticator and step itself up with it. A first enrolment has
 * nothing to present and is exempt; it is also the only enrolment that
 * counts as verification of the session.
 */
export async function enrolmentGate(userId: string, sessionId: string, now = new Date()): Promise<{ first: boolean; blocked: boolean }> {
  const state = await stepUpState(userId, sessionId, now)
  if (state === 'not-enrolled') return { first: true, blocked: false }
  return { first: false, blocked: state === 'required' }
}
