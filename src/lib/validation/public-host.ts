import { isIP } from 'node:net'

/** Canonical URL host policy, not a DNS or socket-level egress guarantee. */
export function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (host.startsWith('[') && host.endsWith(']')) {
    const address = host.slice(1, -1)
    if (isIP(address) !== 6) return false
    // URL has normalized embedded IPv4 to hex. Global unicast only; refuse
    // protocol assignments, documentation and transition ranges conservatively.
    const [left, right = ''] = address.split('::')
    const a = left ? left.split(':') : [], b = right ? right.split(':') : []
    const words = address.includes('::') ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b] : a
    const value = words.reduce((sum, word) => (sum << 16n) | BigInt(`0x${word}`), 0n)
    const inRange = (prefix: bigint, bits: number) => value >> BigInt(128 - bits) === prefix
    return inRange(1n, 3) && !inRange(0x2001n << 7n, 23) &&
      !inRange(0x20010db8n, 32) && !inRange(0x2002n, 16) && !inRange(0x3fffn << 4n, 20)
  }
  if (isIP(host) === 4) {
    const [a, b, c] = host.split('.').map(Number)
    if (a === 0 || a === 10 || a === 127 || a! >= 224) return false
    if (a === 100 && b! >= 64 && b! <= 127) return false
    if (a === 169 && b === 254 || a === 172 && b! >= 16 && b! <= 31) return false
    if (a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99)) return false
    if (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) return false
    if (a === 203 && b === 0 && c === 113) return false
    return true
  }
  if (host.length > 253 || /(^|\.)(localhost|local|internal|home|lan|corp|intranet)$/.test(host)) return false
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)
}
