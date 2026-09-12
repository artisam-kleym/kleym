/**
 * TOTP, RFC 6238 over HOTP, RFC 4226. Issue #47.
 *
 * SHA-1, 30-second steps, six digits — what every authenticator app
 * implements. Verification accepts the previous and next step (clock skew),
 * and NEVER more: a wider window is more guesses per attempt, and attempts
 * are what the lockout counts.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const TOTP_STEP_SECONDS = 30
export const TOTP_DIGITS = 6
export const TOTP_WINDOW = 1

export function base32Encode(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** 20 random bytes — 160 bits, the RFC 4226 recommendation. */
export function generateTotpKey(): string {
  return base32Encode(randomBytes(20))
}

export function hotp(keyBase32: string, counter: number): string {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', base32Decode(keyBase32)).update(buf).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const code = ((digest[offset]! & 0x7f) << 24) | (digest[offset + 1]! << 16) | (digest[offset + 2]! << 8) | digest[offset + 3]!
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0')
}

export function totpAt(keyBase32: string, at: Date = new Date()): string {
  return hotp(keyBase32, Math.floor(at.getTime() / 1000 / TOTP_STEP_SECONDS))
}

/** Constant-time over the window; the step that matched, or null. */
export function totpMatches(keyBase32: string, code: string, at: Date = new Date()): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const step = Math.floor(at.getTime() / 1000 / TOTP_STEP_SECONDS)
  let matched: number | null = null
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta += 1) {
    const candidate = hotp(keyBase32, step + delta)
    if (timingSafeEqual(Buffer.from(candidate), Buffer.from(code))) matched = step + delta
  }
  return matched
}

export function otpauthUri(issuer: string, account: string, keyBase32: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${keyBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`
}
