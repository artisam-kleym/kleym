import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const config = vi.hoisted(() => ({ ZENDER_BASE_URL: 'https://zender.test/api/v1', ZENDER_API_KEY: 'fixture-only', EMAIL_FROM: 'mail@kleym.test', EMAIL_PROVIDER: 'zender' }))
vi.mock('@/lib/config/env', () => ({ env: config }))
import { sendZender, retryAfterMs, zenderMessageStatus } from '@/lib/email/zender'
import { emailVerificationAvailable } from '@/lib/email/delivery-policy'
import { otpEmail } from '@/lib/email/templates'
const send = () => sendZender({ to: 'recipient@example.com', ...otpEmail('123456'), idempotencyKey: 'otp:delivery:fixture-event' })
const request = vi.fn()
beforeEach(() => { vi.stubGlobal('fetch', request); request.mockReset(); config.ZENDER_API_KEY = 'fixture-only' })
afterEach(() => vi.unstubAllGlobals())
describe('Zender server transport', () => {
  it('queues one inline transactional mail with a stable business-event key and no SDK or claim URL', async () => {
    request.mockImplementation(async () => new Response(JSON.stringify({ data: { messages: [{ id: 'message-1' }], suppressed: [] } }), { status: 202 }))
    expect(await send()).toEqual({ id: 'message-1' })
    await send()
    expect(request.mock.calls.map((call) => call[1].headers['Idempotency-Key'])).toEqual(['otp:delivery:fixture-event', 'otp:delivery:fixture-event'])
    const [url, options] = request.mock.calls[0]!
    expect(url).toBe('https://zender.test/api/v1/emails')
    expect(options.redirect).toBe('error')
    expect(JSON.parse(options.body)).toMatchObject({ to: [{ email: 'recipient@example.com' }], subject_override: expect.any(String), content: { text: expect.stringContaining('123456') } })
    expect(options.body).not.toContain('/claim')
  })
  it.each([401, 403, 409, 422])('does not retry permanent HTTP %i and never echoes provider content', async (status) => {
    request.mockResolvedValue(new Response('private-message-body', { status }))
    await expect(send()).rejects.toThrow(`Zender rejected mail (${status})`)
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('does not call suppressed recipients queued, and rejects malformed success responses', async () => {
    for (const data of [{ messages: [], suppressed: ['recipient@example.com'] }, {}, { messages: [{ id: 'a' }, { id: 'b' }] }]) {
      request.mockResolvedValue(new Response(JSON.stringify({ data }), { status: 202 }))
      await expect(send()).rejects.toThrow('did not queue')
    }
  })
  it('fails closed without a credential and never transmits a bearer secret', async () => {
    config.ZENDER_API_KEY = ''
    expect(emailVerificationAvailable()).toBe(false)
    await expect(send()).rejects.toThrow('not configured')
    config.ZENDER_API_KEY = 'fixture-only'
    expect(emailVerificationAvailable()).toBe(true)
    await expect(sendZender({ to: 'recipient@example.com', text: '/claim#' + 'S' + 'A'.repeat(55), html: '', subject: 'QA', idempotencyKey: 'fixture-event-1' })).rejects.toThrow('Private claim material')
    expect(request).not.toHaveBeenCalled()
  })
  it('retries an ambiguous network outcome with the exact original key/body and sanitizes failure', async () => {
    request.mockRejectedValue(new Error('private-message-body'))
    await expect(send()).rejects.toThrow('Zender request could not complete')
    expect(request).toHaveBeenCalledTimes(3)
    expect(new Set(request.mock.calls.map(call => call[1].body)).size).toBe(1)
    expect(new Set(request.mock.calls.map(call => call[1].headers['Idempotency-Key'])).size).toBe(1)
  })
  it('backs off transient errors then accepts the original business event', async () => {
    request.mockResolvedValueOnce(new Response('private-body', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { messages: [{ id: 'message-1' }], suppressed: [] } }), { status: 202 }))
    expect(await send()).toEqual({ id: 'message-1' })
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[0]![1].body).toBe(request.mock.calls[1]![1].body)
  })
  it('does not retry earlier than a Retry-After that exceeds the request budget', async () => {
    request.mockResolvedValue(new Response('private-body', { status: 429, headers: { 'Retry-After': '60', 'X-Request-Id': '12345678-1234-1234-1234-123456789abc' } }))
    await expect(send()).rejects.toMatchObject({ status: 429, retryAfterSeconds: 60, requestId: '12345678-1234-1234-1234-123456789abc' })
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('parses integer and HTTP-date Retry-After without inventing an early retry', () => {
    expect(retryAfterMs('2')).toBe(2000)
    expect(retryAfterMs('Sun, 25 Oct 2026 12:00:02 GMT', Date.parse('2026-10-25T12:00:00Z'))).toBe(2000)
    expect(retryAfterMs('invalid')).toBeNull()
  })
  it('polls only the specified message and returns status without personal data', async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ data: { id: 'message-1', status: 'delivered', to: 'recipient@example.com', content: 'private' } })))
    expect(await zenderMessageStatus('message-1')).toBe('delivered')
    expect(request.mock.calls[0]![0]).toBe('https://zender.test/api/v1/emails/message-1')
    request.mockResolvedValue(new Response(JSON.stringify({ data: { id: 'other-message', status: 'delivered' } })))
    await expect(zenderMessageStatus('message-1')).rejects.toThrow('Invalid Zender status response')
    await expect(zenderMessageStatus('../me')).rejects.toThrow('Invalid Zender status lookup')
  })
  it('does not mistake engagement alone for proof of delivery, and preserves status Retry-After', async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ data: { id: 'message-1', status: 'clicked', delivered_at: null } })))
    expect(await zenderMessageStatus('message-1')).toBe('sent')
    request.mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '120' } }))
    await expect(zenderMessageStatus('message-1')).rejects.toMatchObject({ status: 429, retryAfterSeconds: 120 })
  })
})
