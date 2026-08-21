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
function trustedProxyHops(): number {
  // Sanitised rather than trusted. `Number('')` is 0 and `Number('abc')` is
  // NaN, and either would push the index off the front of the list so that
  // EVERY caller resolved to UNKNOWN_IP — one shared bucket, which is per-IP
  // limiting switched off without anything saying so. A blank value is the
  // likely mistake, since .env.example lists every key empty.
  const raw = Number(process.env.TRUSTED_PROXY_HOPS)
  return Number.isInteger(raw) && raw >= 1 ? raw : 1
}

const TRUSTED_PROXY_HOPS = trustedProxyHops()

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

  /*
   * If the header is SHORTER than the configured hop count, the request did
   * not arrive through the expected chain — a misconfigured hop count, or a
   * request that reached us without traversing every proxy.
   *
   * Fall back to the RIGHTMOST entry, never the leftmost. Clamping to index 0
   * would hand back the entry the client supplied, which is precisely the
   * value this function exists to avoid trusting: with TRUSTED_PROXY_HOPS
   * above the real hop count, every caller could choose their own rate-limit
   * bucket again. The rightmost entry was written by whichever proxy spoke to
   * us last, so it is never caller-controlled.
   */
  if (index < 0) return hops[hops.length - 1] ?? UNKNOWN_IP

  return hops[index] ?? UNKNOWN_IP
}
