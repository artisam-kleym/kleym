/**
 * Passkeys (WebAuthn) as a second factor. Issue #47.
 *
 * The authenticator holds the private key; Kleym holds the public key, the
 * credential id and a signature counter. Challenges live in Redis for five
 * minutes, keyed by the session that asked for them, so an assertion can
 * only answer a challenge issued to the same session.
 */
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { prisma } from '@/lib/db/client'
import { redis } from '@/lib/redis/client'
import { env } from '@/lib/config/env'
import { logger } from '@/lib/config/logger'
import { recordAudit } from '@/lib/api/audit'
import { issueRecoveryCodes } from './factors'

const CHALLENGE_TTL_SECONDS = 300

export function relyingParty(): { rpID: string; rpName: string; origin: string } {
  const url = new URL(env.APP_URL)
  return { rpID: env.WEBAUTHN_RP_ID || url.hostname, rpName: env.WEBAUTHN_RP_NAME, origin: url.origin }
}

const challengeKey = (sessionId: string, purpose: 'register' | 'authenticate') => `mfa:challenge:${purpose}:${sessionId}`

async function storeChallenge(sessionId: string, purpose: 'register' | 'authenticate', challenge: string): Promise<void> {
  await redis.set(challengeKey(sessionId, purpose), challenge, 'EX', CHALLENGE_TTL_SECONDS)
}

/** Read AND deleted: a challenge answers once. Fail closed when Redis is gone. */
async function takeChallenge(sessionId: string, purpose: 'register' | 'authenticate'): Promise<string | null> {
  const key = challengeKey(sessionId, purpose)
  const value = await redis.get(key)
  if (value) await redis.del(key)
  return value
}

export async function passkeyRegistrationOptions(user: { id: string; username: string }, sessionId: string) {
  const { rpID, rpName } = relyingParty()
  const existing = await prisma.mfaPasskey.findMany({ where: { userId: user.id }, select: { credentialId: true, transports: true } })
  const options = await generateRegistrationOptions({
    rpID,
    rpName,
    userName: user.username,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: c.transports as AuthenticatorTransport[] })),
    // User verification preferred, not required: this is the SECOND factor —
    // the password is the first — so a touch on a security key is enough.
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  })
  await storeChallenge(sessionId, 'register', options.challenge)
  return options
}

export async function passkeyRegister(user: { id: string }, sessionId: string, response: RegistrationResponseJSON, name: string, ip: string | null): Promise<{ ok: true; id: string; recoveryCodes: string[] | null } | { ok: false; reason: string }> {
  const expectedChallenge = await takeChallenge(sessionId, 'register')
  if (!expectedChallenge) return { ok: false, reason: 'no challenge outstanding' }
  const { rpID, origin } = relyingParty()
  let verification
  try {
    verification = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false })
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'verification failed' }
  }
  if (!verification.verified || !verification.registrationInfo) return { ok: false, reason: 'not verified' }
  const { credential } = verification.registrationInfo
  const row = await prisma.mfaPasskey.create({
    data: {
      userId: user.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      transports: credential.transports ?? [],
      name: name.trim().slice(0, 60) || 'Passkey',
    },
    select: { id: true },
  })
  await recordAudit({ userId: user.id, action: 'mfa.passkey_added', entityType: 'user', entityId: user.id, metadata: { passkeyId: row.id }, ip })
  logger.info({ userId: user.id, passkeyId: row.id }, 'mfa: passkey added')
  // Recovery codes come with the FIRST factor of either kind, so a passkey-only user is not one lost device from an admin reset.
  const recoveryCodes = (await prisma.mfaRecoveryCode.count({ where: { userId: user.id } })) === 0 ? await issueRecoveryCodes(user.id) : null
  return { ok: true, id: row.id, recoveryCodes }
}

export async function passkeyAuthenticationOptions(userId: string, sessionId: string) {
  const { rpID } = relyingParty()
  const creds = await prisma.mfaPasskey.findMany({ where: { userId }, select: { credentialId: true, transports: true } })
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.map((c) => ({ id: c.credentialId, transports: c.transports as AuthenticatorTransport[] })),
    userVerification: 'preferred',
  })
  await storeChallenge(sessionId, 'authenticate', options.challenge)
  return options
}

export async function passkeyAuthenticate(userId: string, sessionId: string, response: AuthenticationResponseJSON): Promise<{ ok: true; passkeyId: string } | { ok: false; reason: string }> {
  const expectedChallenge = await takeChallenge(sessionId, 'authenticate')
  if (!expectedChallenge) return { ok: false, reason: 'no challenge outstanding' }
  // Scoped to the user in the query: a credential id from another account matches nothing.
  const cred = await prisma.mfaPasskey.findFirst({ where: { userId, credentialId: response.id }, select: { id: true, credentialId: true, publicKey: true, counter: true, transports: true } })
  if (!cred) return { ok: false, reason: 'unknown credential' }
  const { rpID, origin } = relyingParty()
  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: { id: cred.credentialId, publicKey: new Uint8Array(cred.publicKey), counter: Number(cred.counter), transports: cred.transports as AuthenticatorTransport[] },
    })
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'verification failed' }
  }
  if (!verification.verified) return { ok: false, reason: 'not verified' }
  await prisma.mfaPasskey.update({ where: { id: cred.id }, data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() } })
  return { ok: true, passkeyId: cred.id }
}

export async function removePasskey(userId: string, passkeyId: string, ip: string | null): Promise<boolean> {
  const removed = await prisma.mfaPasskey.deleteMany({ where: { id: passkeyId, userId } })
  if (removed.count === 0) return false
  await recordAudit({ userId, action: 'mfa.passkey_removed', entityType: 'user', entityId: userId, metadata: { passkeyId }, ip })
  return true
}
