/**
 * Regression tests for the rate-limit bypass found reviewing #24.
 *
 * `X-Forwarded-For` is appended to by each hop, so its LEFTMOST entry is
 * whatever the client sent. Keying a rate limit on that lets anyone pick a
 * fresh bucket per request and never be limited.
 */
import { describe, expect, it } from 'vitest'
import { clientIp, UNKNOWN_IP } from '@/lib/auth/client-ip'

const req = (forwarded?: string) =>
  new Request('https://kleym.test/api/auth/login', {
    headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded },
  })

describe('clientIp', () => {
  it('returns the address the edge appended, not the one the client sent', () => {
    expect(clientIp(req('1.1.1.1, 203.0.113.9'))).toBe('203.0.113.9')
  })

  it('gives every spoofing attempt the SAME bucket', () => {
    const spoofed = ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4'].map((fake) =>
      clientIp(req(`${fake}, 203.0.113.9`)),
    )
    expect(new Set(spoofed).size).toBe(1)
    expect(spoofed[0]).toBe('203.0.113.9')
  })

  it('handles the honest single-hop case', () => {
    expect(clientIp(req('203.0.113.9'))).toBe('203.0.113.9')
  })

  it('tolerates whitespace and empty entries', () => {
    expect(clientIp(req('  1.1.1.1 ,  , 203.0.113.9  '))).toBe('203.0.113.9')
  })

  it('falls back to a shared bucket rather than bypassing the limit', () => {
    expect(clientIp(req())).toBe(UNKNOWN_IP)
    expect(clientIp(req(''))).toBe(UNKNOWN_IP)
    expect(clientIp(req(' , '))).toBe(UNKNOWN_IP)
  })

  it('never returns a caller-supplied value, however many are sent', () => {
    const forged = Array.from({ length: 20 }, (_, i) => `10.0.0.${i}`).join(', ')
    expect(clientIp(req(`${forged}, 203.0.113.9`))).toBe('203.0.113.9')
  })
})
