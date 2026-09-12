/**
 * The fragment reader. SPEC.md §3.6, AGENT.md §1.
 *
 * This is where the only secret the recipient holds enters the application, so
 * the tests are about what it REFUSES and what it never reveals, not only what
 * it accepts.
 */
import { describe, expect, it } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { readFragment } from '@/lib/claim/fragment'

const keypair = Keypair.random()
const SEED = keypair.secret()

describe('reading #s=<seed>', () => {
  it('accepts the format the wizard writes', () => {
    const result = readFragment(`#s=${SEED}`)
    expect(result).toEqual({
      ok: true,
      secret: SEED,
      ephemeralPublicKey: keypair.publicKey(),
    })
  })

  it('accepts it without the leading hash, as location.hash may omit it', () => {
    expect(readFragment(`s=${SEED}`)).toMatchObject({ ok: true })
  })

  it('derives the public key that actually belongs to the seed', () => {
    const result = readFragment(`#s=${SEED}`)
    expect(result.ok && result.ephemeralPublicKey).toBe(Keypair.fromSecret(SEED).publicKey())
  })
})

describe('what it refuses', () => {
  it.each([
    ['empty', ''],
    ['just a hash', '#'],
    ['a bare seed with no parameter', `#${SEED}`],
    ['a public key', `#s=${keypair.publicKey()}`],
    ['a truncated seed', `#s=${SEED.slice(0, 40)}`],
    ['a seed with trailing junk', `#s=${SEED}x`],
    ['lowercase', `#s=${SEED.toLowerCase()}`],
    ['a different parameter', `#seed=${SEED}`],
    ['two parameters', `#s=${SEED}&t=1`],
    ['a query string instead', `?s=${SEED}`],
  ])('refuses %s', (_name, hash) => {
    expect(readFragment(hash)).toEqual({ ok: false })
  })

  /*
   * base64url is what SPEC.md §3.6 originally specified. It is refused because
   * encoding the seed blinds every leak guard in the repo — `scanForSecretSeed`,
   * the env scan and the CI grep all match S[A-Z2-7]{55}.
   */
  it('refuses a base64url-encoded seed, which is why the format is raw', () => {
    const encoded = Buffer.from(SEED).toString('base64url')
    expect(readFragment(`#s=${encoded}`)).toEqual({ ok: false })
    expect(/S[A-Z2-7]{55}/.test(encoded)).toBe(false) // the reason
    expect(/S[A-Z2-7]{55}/.test(SEED)).toBe(true)
  })

  /*
   * A failure must not echo the input. A caller that receives the malformed
   * value can render it, report it, or log it — and the malformed value is
   * very often a real seed with a typo.
   */
  it('reveals nothing about what it rejected', () => {
    const result = readFragment(`#s=${SEED}x`)
    expect(Object.keys(result)).toEqual(['ok'])
    expect(JSON.stringify(result)).not.toContain(SEED.slice(0, 20))
  })
})
