/**
 * Placeholder. The real claim page is #11 — this exists so the route resolves
 * and its header treatment (Referrer-Policy: no-referrer) is verifiable now.
 */

/**
 * REQUIRED, not an optimisation choice.
 *
 * A prerendered route's HTML is generated at build time, so the inline RSC
 * flight payload it contains can never carry a per-request nonce. Under a CSP
 * with no 'unsafe-inline' — which AGENT.md §5.3 forbids — those inline scripts
 * are refused, `self.__next_f` stays empty, and React throws #412 while the
 * page still returns 200.
 *
 * #11 must read window.location.hash, derive the ephemeral keypair and call
 * history.replaceState. None of that runs on a page that never hydrates.
 */
export const dynamic = 'force-dynamic'
export default function ClaimPlaceholder() {
  return <main>Claim</main>
}
