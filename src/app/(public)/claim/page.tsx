import { env } from '@/lib/config/env'
import { ClaimFlow } from './claim-flow'

/**
 * REQUIRED, not an optimisation choice.
 *
 * A prerendered route's HTML is generated at build time, so the inline RSC
 * flight payload it contains can never carry a per-request nonce. Under a CSP
 * with no 'unsafe-inline' — which AGENT.md §5.3 forbids — those inline scripts
 * are refused, `self.__next_f` stays empty, and React throws #412 while the
 * page still returns 200.
 *
 * This page reads window.location.hash, derives a keypair and calls
 * history.replaceState. None of that runs on a page that never hydrates, and a
 * status code will not tell you: it has to be loaded in a browser.
 */
export const dynamic = 'force-dynamic'

/**
 * `/claim` — SPEC.md §5.1, §3.6. AGENT.md §5.2.
 *
 * The most sensitive route in the system: it handles a bearer secret held in a
 * URL fragment, for an audience who may never have used Stellar.
 *
 * No third-party scripts, fonts or analytics. WalletConnect communication is
 * loaded only after an explicit mobile connection request. Only network and
 * the public project identifier cross the server/client boundary.
 */
export default function ClaimPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-surface-base px-md py-2xl">
      {/*
        BRAND.md §5.8. Decorative only, and hidden from assistive technology;
        §7 turns the motion off under prefers-reduced-motion.
      */}
      <div aria-hidden="true" className="orb-claim pointer-events-none absolute" />

      <div className="relative w-full max-w-[520px]">
        <h1 className="sr-only">Claim your funds</h1>
        <ClaimFlow network={env.STELLAR_NETWORK} mobileWallet={env.WALLETCONNECT_PROJECT_ID ? { projectId: env.WALLETCONNECT_PROJECT_ID } : undefined} />

        <footer className="mt-lg text-center">
          <p className="text-body-md text-on-surface-variant">
            {/*
              BRAND.md §8: "non-custodial" is jargon to this audience. Say what
              it means instead.
            */}
            Only you can access these funds. Kleym never holds them.
          </p>
          <p className="mt-xs font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
            Powered by Kleym on Stellar
          </p>
        </footer>
      </div>
    </main>
  )
}
