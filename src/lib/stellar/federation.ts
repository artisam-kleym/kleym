/** Pure federation host, TOML and memo validation, shared with the route and tests. */
import { checkMemo, memoTypeFromFederation } from './memo'

export function isPublicHost(hostname: string): boolean {
  const raw = hostname.toLowerCase().replace(/\.$/, '')
  if (raw === '' || raw.includes(':') || raw.includes('/') || raw.includes('@') || /^\[|\]$/.test(raw)) return false
  /*
   * Checked on what the URL parser will actually connect to, not on the
   * spelling: `127.1`, `0177.0.0.1` and `0x7f.0.0.1` all read as domain-ish
   * text and all normalise to 127.0.0.1 the moment a URL is built from them.
   */
  let host: string
  try {
    const url = new URL(`https://${raw}/`)
    if (url.username || url.password || url.port) return false
    host = url.hostname
  } catch {
    return false
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split('.').map(Number) as [number, number, number, number]
    if (a === 10 || a === 127 || a === 0 || a >= 224) return false
    if (a === 172 && b! >= 16 && b! <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 169 && b === 254) return false
    if (a === 100 && b! >= 64 && b! <= 127) return false
    if (a === 192 && b === 0) return false
    if (a === 198 && (b === 18 || b === 19)) return false
    return true
  }
  if (host === 'localhost' || /\.(local|internal|localhost|home|lan|corp|intranet)$/.test(host)) return false
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)
}

export function federationServerOf(toml: string): string | null {
  for (const line of toml.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (/^\[/.test(trimmed)) break
    // Either TOML quote style; the value is taken as written.
    const match = /^FEDERATION_SERVER\s*=\s*(["'])([^"']*)\1/.exec(trimmed)
    if (match) return match[2]!
  }
  return null
}

/** A federation memo, as the exchange's server returned it, checked before relay — or null. */
export function memoFromRecord(record: { memo_type?: unknown; memo?: unknown }): { type: 'id' | 'text' | 'hash'; value: string } | null {
  const memoType = memoTypeFromFederation(typeof record.memo_type === 'string' ? record.memo_type : undefined)
  if (!memoType || record.memo === undefined || record.memo === null) return null
  let value: string
  if (typeof record.memo === 'number') {
    // JSON.parse has already rounded anything past 2^53: a plausible-looking wrong memo. Refuse, do not relay.
    if (!Number.isSafeInteger(record.memo) || record.memo < 0) return null
    value = String(record.memo)
  } else if (typeof record.memo === 'string') {
    value = record.memo
  } else {
    return null
  }
  // SEP-0002: a hash memo comes base64-encoded; checkMemo wants the 64 hex characters TX2 will carry.
  if (memoType === 'hash') {
    const bytes = Buffer.from(value, 'base64')
    if (bytes.length !== 32 || bytes.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) return null
    value = bytes.toString('hex')
  }
  const checked = checkMemo({ type: memoType, value })
  return checked.ok ? checked.memo : null
}
