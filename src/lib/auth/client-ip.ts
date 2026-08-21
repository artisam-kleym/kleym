/**
 * Trusted client IP extraction.
 *
 * `X-Forwarded-For` is a list that each hop APPENDS to, so it reads
 * left-to-right as: whatever the client sent, then the address each proxy
 * observed. The leftmost entry is therefore attacker-controlled — anyone can
 * send `X-Forwarded-For: 1.1.1.1` and, if that value is used as a rate-limit
 * key, pick a fresh bucket on every request and never be limited at all.
 *
 * Counting from the RIGHT is what makes this trustworthy: the last entry was
 * appended by our own edge and cannot be forged from outside. With N trusted
 * proxies in front of the app, the real client sits N entries from the end.
 *
 * TRUSTED_PROXY_HOPS must match the deployment. Railway terminates at a single
 * edge proxy, so the default is 1. Raising it without adding a real hop lets a
 * client push its own value into the chosen position; lowering it below the
 * real hop count returns a proxy address instead and buckets every user
 * together. Change it only alongside the infrastructure.
 */
const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)

/** Unresolvable callers share one bucket rather than bypassing the limit. */
export const UNKNOWN_IP = 'unknown'

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (!forwarded) return UNKNOWN_IP

  const hops = forwarded
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (hops.length === 0) return UNKNOWN_IP

  // Index from the end: with one trusted proxy the client is the last entry.
  const index = hops.length - TRUSTED_PROXY_HOPS
  return hops[Math.max(0, index)] ?? UNKNOWN_IP
}
