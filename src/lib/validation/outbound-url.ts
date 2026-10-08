/**
 * A URL a TENANT may point Kleym's own process at — a screening callback
 * (#52), a webhook endpoint (#51). Public HTTPS hosts, no credentials; HTTP to a
 * loopback address outside production only, for local receivers and the
 * verify scripts. Redirects are refused by every caller (`redirect: 'error'`).
 * The production transport pins validated DNS answers at socket creation;
 * deployment egress remains defence in depth. See docs/compliance.md.
 */
import { z } from 'zod'
import { isPublicHostname } from './public-host'

export function outboundUrlFor(nodeEnv: string) {
  const loopbackAllowed = nodeEnv !== 'production'
  return z.string().trim().url().max(2000).refine((v) => {
    try {
      if (/[\\\u0000-\u0020\u007f]/.test(v)) return false
      const u = new URL(v)
      if (u.username || u.password) return false
      const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname.toLowerCase().replace(/\.$/, ''))
      if (loopbackAllowed && loopback && (u.protocol === 'http:' || u.protocol === 'https:')) return true
      return u.protocol === 'https:' && isPublicHostname(u.hostname)
    } catch {
      return false
    }
  }, loopbackAllowed ? 'a public https URL (loopback only outside production), without credentials' : 'a public https URL, without credentials')
}

/** Bound to the raw NODE_ENV: route modules load during `next build`, which has no environment. */
export const outboundUrl = outboundUrlFor(process.env.NODE_ENV ?? 'development')
