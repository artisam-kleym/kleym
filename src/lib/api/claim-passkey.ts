/**
 * PASSKEY policy (#79): bind a link to the first claimant's device.
 *
 * Reuses the WebAuthn implementation #47 brought (`@simplewebauthn/server`)
 * with a different subject: not a Kleym user, but a LINK. The first claimant
 * registers a credential and it is stored against the link; every later
 * action needs an assertion from that credential. A forwarded link is useless
 * without the device that registered — which is the binding this policy is.
 *
 * Who may REGISTER is the question that decides whether the policy is worth
 * anything. The ephemeral public key is the balance's claimant on the public
 * ledger, so it proves nothing; anyone reading Horizon could otherwise bind
 * their own device to every live PASSKEY link and lock the recipient out
 * with no way back. So registration demands what only the link's holder has:
 * a signature by the EPHEMERAL KEYPAIR over the registration challenge. The
 * page has the seed in its fragment and signs in the browser; the seed
 * itself still never leaves it (AGENT.md §1).
 *
 * Challenges are keyed by link AND challenge, live five minutes and answer
 * once — a second `options` call cannot overwrite a ceremony in progress.
 * Nothing here identifies a person: the "user" WebAuthn sees is the link's
 * public key and a fixed display name.
 */
import { createHash } from 'node:crypto'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { Keypair } from '@stellar/stellar-sdk'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { redis } from '@/lib/redis/client'
import { logger } from '@/lib/config/logger'
import { relyingParty } from '@/lib/auth/mfa/passkeys'
import { issueClaimToken } from './claim-policy'

const CHALLENGE_TTL_SECONDS = 300
type Purpose = 'register' | 'authenticate'
const challengeKey = (linkId: string, purpose: Purpose, challenge: string) =>
  `claim:passkey:${purpose}:${linkId}:${createHash('sha256').update(challenge).digest('hex')}`

/**
 * The link, only while it is claimable: ACTIVE, funded, unexpired, on a live
 * unsuspended campaign, under the PASSKEY policy. Anything else is null —
 * the same answer as an unknown key, so these routes are not the oracle
 * `resolve` refuses to be (SPEC.md §6.4), and a passkey is never bound to a
 * link that can no longer be claimed.
 */
async function claimableLinkFor(ephemeralPublicKey: string, now: Date) {
  const link = await prisma.claimLink.findUnique({
    where: { ephemeralPublicKey },
    select: {
      id: true, status: true, balanceId: true, suspendedAt: true,
      campaign: { select: { claimPolicy: true, status: true, expiresAt: true, suspendedAt: true } },
      passkey: { select: { id: true, credentialId: true, publicKey: true, counter: true, transports: true } },
    },
  })
  if (!link || link.campaign.claimPolicy !== 'PASSKEY') return null
  if (link.status !== 'ACTIVE' || !link.balanceId) return null
  if (link.campaign.status === 'CANCELLED' || link.campaign.expiresAt.getTime() <= now.getTime()) return null
  if (link.suspendedAt || link.campaign.suspendedAt) return null
  return link
}

export type PasskeyOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not-found' }
  | { kind: 'conflict'; detail: string }

/** The challenge the authenticator answered, from its own clientDataJSON; null if it is not one. */
function challengeOf(response: { response?: { clientDataJSON?: unknown } }): string | null {
  const raw = response.response?.clientDataJSON
  if (typeof raw !== 'string') return null
  try {
    const data = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { challenge?: unknown }
    return typeof data.challenge === 'string' && data.challenge.length > 0 ? data.challenge : null
  } catch {
    return null
  }
}

async function takeChallenge(linkId: string, purpose: Purpose, challenge: string): Promise<boolean> {
  const key = challengeKey(linkId, purpose, challenge)
  // One answer per challenge: DEL returns how many keys went, so a replay sees 0.
  return (await redis.del(key)) === 1
}

/**
 * The holder's proof: an ed25519 signature by the ephemeral keypair over the
 * challenge's UTF-8 bytes. Only the page that holds the seed can make one.
 */
export function proofHolds(ephemeralPublicKey: string, challenge: string, proof: string): boolean {
  try {
    return Keypair.fromPublicKey(ephemeralPublicKey).verify(Buffer.from(challenge, 'utf8'), Buffer.from(proof, 'base64'))
  } catch {
    return false
  }
}

/** Registration options for a link with no passkey yet — the FIRST claimant. */
export async function passkeyRegisterOptions(ephemeralPublicKey: string, now: Date = new Date()): Promise<PasskeyOutcome<unknown>> {
  const link = await claimableLinkFor(ephemeralPublicKey, now)
  if (!link) return { kind: 'not-found' }
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
  await redis.set(challengeKey(link.id, 'register', options.challenge), '1', 'EX', CHALLENGE_TTL_SECONDS)
  return { kind: 'ok', value: options }
}

/**
 * Binds the link to the credential and issues the token. Needs the holder's
 * proof over the challenge; exactly once per link — a race loses on the
 * unique index.
 */
export async function passkeyRegister(
  ephemeralPublicKey: string,
  response: RegistrationResponseJSON,
  proof: string,
  now: Date = new Date(),
): Promise<PasskeyOutcome<{ token: string }>> {
  const link = await claimableLinkFor(ephemeralPublicKey, now)
  if (!link) return { kind: 'not-found' }
  if (link.passkey) return { kind: 'conflict', detail: 'This link is already bound to a passkey.' }
  const challenge = challengeOf(response)
  if (!challenge || !(await takeChallenge(link.id, 'register', challenge))) {
    return { kind: 'conflict', detail: 'No registration is in progress. Start again.' }
  }
  // Checked before the ceremony is verified: without the seed there is nothing to verify.
  if (!proofHolds(ephemeralPublicKey, challenge, proof)) {
    logger.warn({ linkId: link.id }, 'passkey registration without proof of the link secret; refused')
    return { kind: 'conflict', detail: 'This link cannot be bound from here. Open the link you were given.' }
  }
  const { rpID, origin } = relyingParty()
  let verification
  try {
    verification = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false })
  } catch (error) {
    return { kind: 'conflict', detail: `The passkey could not be verified (${error instanceof Error ? error.message : 'unknown'}).` }
  }
  if (!verification.verified || !verification.registrationInfo) return { kind: 'conflict', detail: 'The passkey could not be verified.' }
  const { credential } = verification.registrationInfo
  try {
    await prisma.claimLinkPasskey.create({
      data: { linkId: link.id, credentialId: credential.id, publicKey: Buffer.from(credential.publicKey), counter: BigInt(credential.counter), transports: credential.transports ?? [] },
    })
  } catch (error) {
    // The unique index on linkId is the real guard: two first claimants, one
    // wins. Only THAT is "a moment ago"; anything else is a fault to report.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { kind: 'conflict', detail: 'This link was bound to a passkey a moment ago.' }
    }
    throw error
  }
  logger.info({ linkId: link.id }, 'claim link bound to a passkey')
  return { kind: 'ok', value: { token: await issueClaimToken(link.id) } }
}

export async function passkeyAuthenticateOptions(ephemeralPublicKey: string, now: Date = new Date()): Promise<PasskeyOutcome<unknown>> {
  const link = await claimableLinkFor(ephemeralPublicKey, now)
  if (!link) return { kind: 'not-found' }
  if (!link.passkey) return { kind: 'conflict', detail: 'This link has no passkey yet. Register one to claim.' }
  const { rpID } = relyingParty()
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [{ id: link.passkey.credentialId, transports: link.passkey.transports as AuthenticatorTransport[] }],
    userVerification: 'preferred',
  })
  await redis.set(challengeKey(link.id, 'authenticate', options.challenge), '1', 'EX', CHALLENGE_TTL_SECONDS)
  return { kind: 'ok', value: options }
}

export async function passkeyAuthenticate(
  ephemeralPublicKey: string,
  response: AuthenticationResponseJSON,
  now: Date = new Date(),
): Promise<PasskeyOutcome<{ token: string }>> {
  const link = await claimableLinkFor(ephemeralPublicKey, now)
  if (!link) return { kind: 'not-found' }
  if (!link.passkey) return { kind: 'conflict', detail: 'This link has no passkey yet. Register one to claim.' }
  if (link.passkey.credentialId !== response.id) return { kind: 'conflict', detail: 'That is not the passkey this link is bound to.' }
  const challenge = challengeOf(response)
  if (!challenge || !(await takeChallenge(link.id, 'authenticate', challenge))) {
    return { kind: 'conflict', detail: 'No sign-in is in progress. Start again.' }
  }
  const { rpID, origin } = relyingParty()
  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
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
