/**
 * A URL a TENANT may point Kleym's own process at — a screening callback
 * (#52), a webhook endpoint (#51). HTTPS, no credentials; plain HTTP to a
 * loopback address outside production only, for local receivers and the
 * verify scripts. Redirects are refused by every caller (`redirect: 'error'`).
 * Kleym does not resolve the hostname first — docs/compliance.md states the
 * deployment's half of that defence.
 */
import { z } from 'zod'

export function outboundUrlFor(nodeEnv: string) {
  const loopbackAllowed = nodeEnv !== 'production'
  return z.string().trim().url().max(2000).refine((v) => {
    try {
      const u = new URL(v)
      if (u.username || u.password) return false
      if (u.protocol === 'https:') return true
      return loopbackAllowed && u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]')
    } catch {
      return false
    }
  }, loopbackAllowed ? 'an https URL (http only for a loopback address), without credentials' : 'an https URL, without credentials')
}

/** Bound to the raw NODE_ENV: route modules load during `next build`, which has no environment. */
export const outboundUrl = outboundUrlFor(process.env.NODE_ENV ?? 'development')
