import { describe, expect, it } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { prepareProofMessage, type PrepareProofInput } from '@/lib/claim/prepare-proof'
import { validClaimPrepareProof } from '@/lib/api/claim-prepare-proof'
import { env } from '@/lib/config/env'

const key = Keypair.random(), recipient = Keypair.random().publicKey(), now = 1790800000
const input: PrepareProofInput = { ephemeralPublicKey: key.publicKey(), recipientPublicKey: recipient,
  receiveAs: { assetCode: 'XLM', assetIssuer: null, destMin: '1.25' }, memo: { type: 'text', value: 'reference' } }
function request(expires = now + 90, origin = new URL(env.APP_URL).origin, network: 'testnet' | 'public' = env.STELLAR_NETWORK,
  phase: 'materialise' | 'claim' = 'claim', holder = key) {
  const proof = holder.sign(Buffer.from(prepareProofMessage(origin, network, phase, expires, input))).toString('base64')
  return new Request('http://localhost/api/claims/prepare/claim', { headers: { 'x-kleym-proof-expires': String(expires), 'x-kleym-link-proof': proof } })
}
describe('claim preparation holder proof', () => {
  it('accepts the link holder signature without receiving the private key', () => expect(validClaimPrepareProof(request(), 'claim', input, now)).toBe(true))
  it('refuses public-key-only callers', () => expect(validClaimPrepareProof(new Request('http://localhost'), 'claim', input, now)).toBe(false))
  it('refuses a different key signature', () => expect(validClaimPrepareProof(request(now + 90, undefined, undefined, undefined, Keypair.random()), 'claim', input, now)).toBe(false))
  it.each([now, now - 1, now + 121])('refuses expired or excessive lifetime %s', (expires) => expect(validClaimPrepareProof(request(expires), 'claim', input, now)).toBe(false))
  it('binds the deployment origin', () => expect(validClaimPrepareProof(request(now + 90, 'https://another.example'), 'claim', input, now)).toBe(false))
  it('binds network and phase', () => {
    expect(validClaimPrepareProof(request(now + 90, undefined, 'public'), 'claim', input, now)).toBe(false)
    expect(validClaimPrepareProof(request(now + 90, undefined, undefined, 'materialise'), 'claim', input, now)).toBe(false)
  })
  it.each([
    { ...input, recipientPublicKey: Keypair.random().publicKey() },
    { ...input, receiveAs: { ...input.receiveAs!, destMin: '0.1' } },
    { ...input, memo: { type: 'text', value: 'changed' } },
  ])('binds destination, conversion floor and memo', (changed) => expect(validClaimPrepareProof(request(), 'claim', changed, now)).toBe(false))
})
