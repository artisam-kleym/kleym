/**
 * Receiving a Kleym webhook.
 *
 * `x-kleym-signature: v1=<hex>` is HMAC-SHA256 over `<x-kleym-timestamp>.<raw body>`
 * with the endpoint's signing key. Verify with the RAW body bytes, before
 * parsing; and check the timestamp against your clock — a captured delivery
 * replayed later fails here even with a valid signature. Deliveries carry
 * `x-kleym-delivery`, the delivery id, which is also `id` in the body: use it
 * as your idempotency key, since a retried delivery is the same id.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export const DEFAULT_TOLERANCE_SECONDS = 300

export interface VerifyOptions {
  toleranceSeconds?: number
  now?: () => number
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'stale' | 'mismatch' }

function header(headers: Record<string, string | string[] | undefined> | Headers, name: string): string | undefined {
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(name) ?? undefined
  const v = (headers as Record<string, string | string[] | undefined>)[name] ?? (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()]
  return Array.isArray(v) ? v[0] : v
}

export function verifyWebhook(rawBody: string, headers: Record<string, string | string[] | undefined> | Headers, signingKey: string, opts: VerifyOptions = {}): VerifyResult {
  const signature = header(headers, 'x-kleym-signature')
  const timestamp = header(headers, 'x-kleym-timestamp')
  if (!signature || !timestamp) return { ok: false, reason: 'missing' }
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || !signature.startsWith('v1=')) return { ok: false, reason: 'malformed' }
  const now = Math.floor((opts.now ?? Date.now)() / 1000)
  if (Math.abs(now - ts) > (opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS)) return { ok: false, reason: 'stale' }
  const expected = `v1=${createHmac('sha256', signingKey).update(`${timestamp}.${rawBody}`).digest('hex')}`
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'mismatch' }
  return { ok: true }
}
