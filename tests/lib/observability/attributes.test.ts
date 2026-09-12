/**
 * Span attributes and metric labels are a log by another name (#53). This
 * is the tracing side's equivalent of the logger redaction test, and the
 * CI secret-handling job runs it: a planted seed, fragment, claim body or
 * ephemeral key must never survive `safeAttributes`.
 */
import { describe, expect, it } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { ALLOWED_ATTRIBUTE_KEYS, safeAttributes } from '@/lib/observability/attributes'
import { routeOf } from '@/lib/auth/rate-limit'

describe('safeAttributes', () => {
  it('keeps allowlisted keys with plain values', () => {
    const { attributes, dropped } = safeAttributes({ phase: 'submit', outcome: 'ok', sequence: 3, remaining: 0 })
    expect(attributes).toEqual({ phase: 'submit', outcome: 'ok', sequence: 3, remaining: 0 })
    expect(dropped).toEqual([])
  })

  it('drops keys that are not on the allowlist, whatever the value', () => {
    const { attributes, dropped } = safeAttributes({ ephemeralPublicKey: 'x', signedXdr: 'y', email: 'a@b', phase: 'resolve' })
    expect(attributes).toEqual({ phase: 'resolve' })
    expect(dropped.sort()).toEqual(['email', 'ephemeralPublicKey', 'signedXdr'])
  })

  it('drops a secret seed under any key', () => {
    const seed = Keypair.random().secret()
    for (const key of ALLOWED_ATTRIBUTE_KEYS) {
      expect(safeAttributes({ [key]: seed }).attributes).toEqual({})
      expect(safeAttributes({ [key]: `prefix ${seed} suffix` }).attributes).toEqual({})
    }
  })

  it('drops anything fragment-shaped', () => {
    expect(safeAttributes({ route: 'https://kleym.app/claim#s=SABC' }).attributes).toEqual({})
    expect(safeAttributes({ reason: '/claim?s=x' }).attributes).toEqual({})
  })

  it('drops a public key on every key except sponsor', () => {
    const pk = Keypair.random().publicKey()
    expect(safeAttributes({ campaignId: pk, reason: pk, outcome: `${pk}` }).attributes).toEqual({})
    expect(safeAttributes({ sponsor: pk }).attributes).toEqual({ sponsor: pk })
  })

  it('drops a claim body or an envelope by shape', () => {
    const xdr = Buffer.alloc(200, 7).toString('base64')
    expect(safeAttributes({ reason: xdr }).attributes).toEqual({})
    expect(safeAttributes({ reason: 'x'.repeat(201) }).attributes).toEqual({})
  })

  it('drops keys the audit scrubber forbids even if allowlisted later by mistake', () => {
    expect(safeAttributes({ 'error.type': 'TypeError', outcome: 'ok' }).attributes).toEqual({ 'error.type': 'TypeError', outcome: 'ok' })
  })

  // Adding a key is a deliberate act: this pins the list so a review sees it change.
  it('has exactly the documented keys', () => {
    expect([...ALLOWED_ATTRIBUTE_KEYS].sort()).toEqual(
      ['attempt', 'batchId', 'campaignId', 'checked', 'dependency', 'error.type', 'index', 'job', 'jobId', 'links', 'network', 'outcome', 'phase', 'queue', 'reason', 'remaining', 'route', 'sequence', 'service', 'sponsor', 'state'].sort(),
    )
  })
})

describe('rate-limit route label', () => {
  it('never carries the caller', () => {
    expect(routeOf('claims:submit:203.0.113.9')).toBe('claims:submit')
    expect(routeOf('login:203.0.113.9')).toBe('login')
    expect(routeOf('otp:request:ip:2001:db8::1')).toBe('otp:request:ip')
    expect(routeOf('apikey:cmtxv21d2000j5qbuxomzwndl')).toBe('apikey')
  })
})
