/**
 * Public API serialisation and error shape. SPEC.md §6.6, AGENT.md §4.1, §4.4.
 */
import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import {
  amount,
  apiNotFound,
  apiRateLimited,
  apiServerError,
  apiUnauthorised,
  apiValidationProblem,
} from '@/lib/api/v1'

describe('amount serialisation', () => {
  // AGENT.md §4.1. A JSON number is an IEEE 754 double; every consumer of this
  // API would inherit whatever precision it loses.
  it('round-trips seven decimal places exactly', () => {
    for (const value of ['0.0000001', '1.0000001', '10000000.0000001', '922337203685.4775807']) {
      expect(amount(value)).toBe(new Decimal(value).toFixed())
      expect(new Decimal(amount(value)).equals(new Decimal(value))).toBe(true)
    }
  })

  it('is a string, never a number', () => {
    expect(typeof amount('1.5')).toBe('string')
    expect(typeof JSON.parse(JSON.stringify({ a: amount('1.5') })).a).toBe('string')
  })

  /*
   * The failure being avoided, demonstrated rather than asserted.
   *
   * `10000000.0000001` survives a double round-trip, so it proves nothing —
   * these are values in Stellar's range that a JSON number genuinely loses.
   * 922337203685.4775807 is the protocol maximum (int64 stroops / 1e7).
   */
  it.each([
    ['922337203685.4775807', '922337203685.4775'],
    ['99999999999.9999999', '100000000000'],
    ['12345678901.2345678', '12345678901.234568'],
  ])('preserves %s, which a JSON number turns into %s', (value, lossy) => {
    expect(amount(value)).toBe(value)
    expect(String(Number(value))).toBe(lossy)
  })

  it('accepts a Prisma Decimal as well as a string', () => {
    expect(amount(new Decimal('2.5000000'))).toBe('2.5')
  })
})

describe('problem responses', () => {
  const responses = [
    ['unauthorised', apiUnauthorised(), 401],
    ['rate limited', apiRateLimited(30), 429],
    ['not found', apiNotFound(), 404],
    ['server error', apiServerError(), 500],
    ['validation', apiValidationProblem([{ path: 'page', message: 'must be positive' }]), 400],
  ] as const

  it.each(responses)('%s is problem+json with the right status', async (_name, response, status) => {
    expect(response.status).toBe(status)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
  })

  it.each(responses)('%s carries a correlation ID', async (_name, response) => {
    const body = await response.clone().json()
    expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it.each(responses)('%s leaks no internal detail', async (_name, response) => {
    const text = await response.clone().text()
    expect(text).not.toMatch(/prisma|postgres|select |at Object\.|\/src\//i)
  })

  it('names the scheme on 401 without saying which part was wrong', async () => {
    const response = apiUnauthorised()
    expect(response.headers.get('www-authenticate')).toBe('Bearer realm="kleym"')
    const body = await response.json()
    // "Revoked", "expired" and "no such key" must all read identically.
    expect(body.detail).not.toMatch(/revoked|expired|unknown|no such/i)
  })

  it('tells a rate-limited caller when to come back', () => {
    expect(apiRateLimited(42).headers.get('retry-after')).toBe('42')
  })
})
