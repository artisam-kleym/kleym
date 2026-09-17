/**
 * PASSKEY policy (#79): bind a link to the first claimant's device.
 *
 * Reuses the WebAuthn implementation #47 brought (`@simplewebauthn/server`)
 * with a different subject: not a Kleym user, but a LINK. The first claimant
 * registers a credential and it is stored against the link; every later
 * action needs an assertion from that credential. A forwarded link is useless
 * without the device that registered — which is the binding this policy is.
 *
 * The challenge is keyed by the link, lives five minutes, answers once.
 * Nothing here identifies a person: the "user" WebAuthn sees is the link's
 * public key and a fixed display name.
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
import { logger } from '@/lib/config/logger'
import { relyingParty } from '@/lib/auth/mfa/passkeys'
import { issueClaimToken } from './claim-policy'

const CHALLENGE_TTL_SECONDS = 300
type Purpose = 'register' | 'authenticate'
const challengeKey = (linkId: string, purpose: Purpose) => `claim:passkey:${purpose}:${linkId}`

async function linkFor(ephemeralPublicKey: string) {
  return prisma.claimLink.findUnique({
    where: { ephemeralPublicKey },
    select: { id: true, status: true, campaign: { select: { claimPolicy: true } }, passkey: { select: { id: true, credentialId: true, publicKey: true, counter: true, transports: true } } },
  })
}

export type PasskeyOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not-found' }
  | { kind: 'conflict'; detail: string }

/** Registration options for a link with no passkey yet — the FIRST claimant. */
export async function passkeyRegisterOptions(ephemeralPublicKey: string): Promise<PasskeyOutcome<unknown>> {
  const link = await linkFor(ephemeralPublicKey)
  if (!link || link.campaign.claimPolicy !== 'PASSKEY') return { kind: 'not-found' }
  if (link.passkey) return { kind: 'conflict', detail: 'This link is already bound to a passkey. Use the device you registered it on.' }
  const { rpID, rpName } = relyingParty()
  const options = await generateRegistrationOptions({
    rpID,
    rpName,
    userName: 'Kleym recipient',
    userID: new TextEncoder().encode(ephemeralPublicKey),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  })
  await redis.set(challengeKey(link.id, 'register'), options.challenge, 'EX', CHALLENGE_TTL_SECONDS)
  return { kind: 'ok', value: options }
}

async function takeChallenge(linkId: string, purpose: Purpose): Promise<string | null> {
  const key = challengeKey(linkId, purpose)
  const value = await redis.get(key)
  if (value) await redis.del(key)
  return value
}

/** Binds the link to the credential and issues the token. Exactly once per link — a race loses on the unique index. */
export async function passkeyRegister(ephemeralPublicKey: string, response: RegistrationResponseJSON): Promise<PasskeyOutcome<{ token: string }>> {
  const link = await linkFor(ephemeralPublicKey)
  if (!link || link.campaign.claimPolicy !== 'PASSKEY') return { kind: 'not-found' }
  if (link.passkey) return { kind: 'conflict', detail: 'This link is already bound to a passkey.' }
  const expectedChallenge = await takeChallenge(link.id, 'register')
  if (!expectedChallenge) return { kind: 'conflict', detail: 'No registration is in progress. Start again.' }
  const { rpID, origin } = relyingParty()
  let verification
  try {
    verification = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false })
  } catch (error) {
    return { kind: 'conflict', detail: `The passkey could not be verified (${error instanceof Error ? error.message : 'unknown'}).` }
  }
  if (!verification.verified || !verification.registrationInfo) return { kind: 'conflict', detail: 'The passkey could not be verified.' }
  const { credential } = verification.registrationInfo
  try {
    await prisma.claimLinkPasskey.create({
      data: { linkId: link.id, credentialId: credential.id, publicKey: Buffer.from(credential.publicKey), counter: BigInt(credential.counter), transports: credential.transports ?? [] },
    })
  } catch {
    // The unique index on linkId is the real guard: two first claimants, one wins.
    return { kind: 'conflict', detail: 'This link was bound to a passkey a moment ago.' }
  }
  logger.info({ linkId: link.id }, 'claim link bound to a passkey')
  return { kind: 'ok', value: { token: await issueClaimToken(link.id) } }
}

export async function passkeyAuthenticateOptions(ephemeralPublicKey: string): Promise<PasskeyOutcome<unknown>> {
  const link = await linkFor(ephemeralPublicKey)
  if (!link || link.campaign.claimPolicy !== 'PASSKEY') return { kind: 'not-found' }
  if (!link.passkey) return { kind: 'conflict', detail: 'This link has no passkey yet. Register one to claim.' }
  const { rpID } = relyingParty()
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [{ id: link.passkey.credentialId, transports: link.passkey.transports as AuthenticatorTransport[] }],
    userVerification: 'preferred',
  })
  await redis.set(challengeKey(link.id, 'authenticate'), options.challenge, 'EX', CHALLENGE_TTL_SECONDS)
  return { kind: 'ok', value: options }
}

export async function passkeyAuthenticate(ephemeralPublicKey: string, response: AuthenticationResponseJSON): Promise<PasskeyOutcome<{ token: string }>> {
  const link = await linkFor(ephemeralPublicKey)
  if (!link || link.campaign.claimPolicy !== 'PASSKEY') return { kind: 'not-found' }
  if (!link.passkey) return { kind: 'conflict', detail: 'This link has no passkey yet. Register one to claim.' }
  if (link.passkey.credentialId !== response.id) return { kind: 'conflict', detail: 'That is not the passkey this link is bound to.' }
  const expectedChallenge = await takeChallenge(link.id, 'authenticate')
  if (!expectedChallenge) return { kind: 'conflict', detail: 'No sign-in is in progress. Start again.' }
  const { rpID, origin } = relyingParty()
  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: { id: link.passkey.credentialId, publicKey: new Uint8Array(link.passkey.publicKey), counter: Number(link.passkey.counter), transports: link.passkey.transports as AuthenticatorTransport[] },
    })
  } catch (error) {
    return { kind: 'conflict', detail: `The passkey could not be verified (${error instanceof Error ? error.message : 'unknown'}).` }
  }
  if (!verification.verified) return { kind: 'conflict', detail: 'The passkey could not be verified.' }
  await prisma.claimLinkPasskey.update({
    where: { id: link.passkey.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
  })
  return { kind: 'ok', value: { token: await issueClaimToken(link.id) } }
}
