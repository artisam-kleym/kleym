import Link from 'next/link'
import { Button, Icon, AmbientOrbs } from '@/components/ui'
import { Footer } from '@/components/shell/footer'

/**
 * Landing page. Copy follows BRAND.md §8 and the §9 corrections — notably
 * correction 1, which is a security-model fix rather than a wording preference.
 */

/**
 * Same constraint as /claim: prerendered HTML carries an inline RSC flight
 * payload that cannot hold a per-request nonce, so under this CSP it is refused
 * and the page never hydrates — serving correct markup while being inert and
 * logging a React #412 on every visit.
 *
 * This costs the static optimisation for the landing page. The alternative is
 * 'unsafe-inline', which AGENT.md §5.3 forbids outright, so it is not a real
 * option. See docs/design-system.md.
 */
export const dynamic = 'force-dynamic'
const STEPS = [
  {
    icon: 'account_balance_wallet' as const,
    title: 'Fund campaign',
    // §9.1: the mock said "Deposit assets via smart contract". Kleym v1 uses
    // native claimable balances, not a contract — shipping that line would
    // misdescribe the security model.
    body: 'Assets locked in claimable balances.',
  },
  {
    icon: 'link' as const,
    title: 'Generate links',
    body: 'One-time links created in your browser. Keys never reach our servers.',
  },
  {
    icon: 'redeem' as const,
    title: 'Share',
    body: 'Recipients claim with any Stellar wallet. No XLM needed.',
  },
]

const VALUE_PROPS = [
  {
    icon: 'verified_user' as const,
    title: 'Non-custodial',
    body: 'Keys are generated in your browser and never leave it. A breach of our database cannot drain a campaign.',
  },
  {
    icon: 'account_balance_wallet' as const,
    title: 'No address collection',
    body: 'Send to people, not to spreadsheets. Recipients connect a wallet when they claim.',
  },
  {
    icon: 'refresh' as const,
    title: 'Unclaimed funds return',
    body: 'Set an expiry. Anything unclaimed comes back to you in one action.',
  },
]

export default function Home() {
  return (
    <>
      <AmbientOrbs variant="dashboard" />
      <div className="mx-auto flex min-h-screen max-w-[1280px] flex-col px-margin-mobile md:px-lg">
        <header className="flex items-center justify-between py-lg">
          <span className="flex items-center gap-sm text-primary">
            <Icon name="toll" size={24} filled />
            <span className="text-headline-md">Kleym</span>
          </span>
          <Link href="/login">
            <Button variant="secondary">Sign in</Button>
          </Link>
        </header>

        <main className="flex-1">
          <section className="py-xl">
            <h1 className="max-w-3xl text-display-lg text-primary max-md:text-headline-md">
              Distribute Stellar assets with a link.
            </h1>
            <p className="mt-md max-w-2xl text-body-lg text-on-surface-variant">
              No wallet address required.
            </p>
            <div className="mt-xl flex flex-wrap gap-md">
              <Link href="/login">
                <Button icon="add">Create a campaign</Button>
              </Link>
            </div>
          </section>

          <section aria-labelledby="how" className="py-xl">
            <h2 id="how" className="text-headline-lg text-primary">
              How it works
            </h2>
            <ol className="mt-lg grid grid-cols-1 gap-md md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[50%] border border-accent-yellow/50 bg-accent-yellow/20 text-tertiary">
                    <Icon name={step.icon} size={24} />
                  </span>
                  <p className="mt-md font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Step {index + 1}
                  </p>
                  <h3 className="mt-1 text-headline-sm text-primary">{step.title}</h3>
                  <p className="mt-sm text-body-md text-on-surface-variant">{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="why" className="py-xl">
            <h2 id="why" className="text-headline-lg text-primary">
              Why Kleym
            </h2>
            <div className="mt-lg grid grid-cols-1 gap-md md:grid-cols-3">
              {VALUE_PROPS.map((prop) => (
                <div key={prop.title} className="glass-card p-lg">
                  <Icon name={prop.icon} size={24} className="text-primary" />
                  {/* §9.9: headline-sm now exists in the type scale. */}
                  <h3 className="mt-md text-headline-sm text-primary">{prop.title}</h3>
                  <p className="mt-sm text-body-md text-on-surface-variant">{prop.body}</p>
                </div>
              ))}
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  )
}
