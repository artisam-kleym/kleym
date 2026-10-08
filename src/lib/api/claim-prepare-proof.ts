import { Keypair } from '@stellar/stellar-sdk'
import { env } from '@/lib/config/env'
import { prepareProofMessage, type PrepareProofInput } from '@/lib/claim/prepare-proof'

/** Check before any source reservation or sponsor signature is created. */
export function validClaimPrepareProof(request: Request, phase: 'materialise' | 'claim', input: PrepareProofInput,
  now = Math.floor(Date.now() / 1000)): boolean {
  const expiresText = request.headers.get('x-kleym-proof-expires') ?? ''
  const proof = request.headers.get('x-kleym-link-proof') ?? ''
  if (!/^\d{10}$/.test(expiresText) || !/^[A-Za-z0-9+/]{86}==$/.test(proof)) return false
  const expires = Number(expiresText)
  if (expires <= now || expires > now + 120) return false
  try {
    const bytes = Buffer.from(prepareProofMessage(new URL(env.APP_URL).origin, env.STELLAR_NETWORK, phase, expires, input))
    return Keypair.fromPublicKey(input.ephemeralPublicKey).verify(bytes, Buffer.from(proof, 'base64'))
  } catch { return false }
}
