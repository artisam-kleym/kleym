/**
 * Delivery signatures. Issue #51.
 *
 * `x-kleym-signature: v1=<hex>` is HMAC-SHA256 over `<timestamp>.<raw body>`
 * with the endpoint's signing key. The timestamp is inside the signed
 * material, so a captured delivery cannot be replayed later with a fresh
 * timestamp, and a receiver that checks the timestamp against its clock
 * rejects a replay of the original. The SDK's `verifyWebhook` does exactly
 * that, and the verify script proves a replay is refused.
 *
 * No Node-only imports beyond `node:crypto` — the SDK mirrors this with the
 * Web Crypto API so receivers on any runtime compute the same value.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export const SIGNATURE_HEADER = 'x-kleym-signature'
export const TIMESTAMP_HEADER = 'x-kleym-timestamp'
export const EVENT_HEADER = 'x-kleym-event'
export const DELIVERY_HEADER = 'x-kleym-delivery'
export const DEFAULT_TOLERANCE_SECONDS = 300

export function signDelivery(signingKey: string, timestamp: string, body: string): string {
  return `v1=${createHmac('sha256', signingKey).update(`${timestamp}.${body}`).digest('hex')}`
}

export function verifyDelivery(
  signingKey: string,
  timestamp: string,
  body: string,
  signature: string,
  opts: { now?: () => number; toleranceSeconds?: number } = {},
): { ok: true } | { ok: false; reason: 'stale' | 'malformed' | 'mismatch' } {
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return { ok: false, reason: 'malformed' }
  const now = Math.floor((opts.now ?? Date.now)() / 1000)
  if (Math.abs(now - ts) > (opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS)) return { ok: false, reason: 'stale' }
  const expected = signDelivery(signingKey, timestamp, body)
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'mismatch' }
  return { ok: true }
}
