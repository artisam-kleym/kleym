/**
 * The OTP gate, as the claim routes apply it. SPEC.md §6.4.
 *
 * A gated link is one Kleym emailed. The recipient proves they hold the
 * ADDRESS as well as the URL, and the proof is a token from
 * `/api/claims/otp/verify` — carried in a header rather than the body so it
 * needs no schema change on three routes, and so it never lands in a request
 * body that something later decides to log.
 */
import { otpSatisfied } from './otp'
import { claimConflict } from './claim-problems'

export const OTP_HEADER = 'x-kleym-otp'

/**
 * Null when the request may proceed, a Response when it may not.
 *
 * Applied on every claim ACTION — materialise, claim, submit — not only the
 * first. Gating just the first would let a caller skip straight to the one
 * that moves the money.
 */
export async function otpGate(
  request: Request,
  ephemeralPublicKey: string,
): Promise<Response | null> {
  const token = request.headers.get(OTP_HEADER)
  if (await otpSatisfied(ephemeralPublicKey, token)) return null

  // The reason is the discriminator: a check that the gate is WIRED reads
  // this, not the prose, and the page maps it back to `otp_required`.
  return claimConflict(
    'This link was sent by email, so it needs the six-digit code from that message.',
    'otp-required',
  )
}
