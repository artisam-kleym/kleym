import type { ReactNode } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { LogoutButton } from './logout-button'
import { env } from '@/lib/config/env'

/** Shared public/account shell. Decorative art never contains campaign data. */
export function AuthShell({
  children,
  wide = false,
  authenticated = false,
}: {
  children: ReactNode
  wide?: boolean
  authenticated?: boolean
}) {
  const homeHref = env.MARKETING_SITE_URL || '/'
  return (
    <div className={`product-ui auth-shell ${wide ? 'auth-shell-wide' : ''}`}>
      <header className="auth-header">
        <a href={homeHref} className="auth-brand">
          <Icon name="toll" size={32} filled />
          Kleym
        </a>
        {authenticated ? (
          <LogoutButton />
        ) : (
          <a href={homeHref} className="auth-home">
            Back to home
          </a>
        )}
      </header>
      <main className="auth-layout">
        {!wide && (
          <aside className="auth-story">
            <svg
              className="auth-illustration"
              viewBox="0 0 380 220"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M70 113H307M183 61V177"
                stroke="#354f6e"
                strokeWidth="2"
                strokeDasharray="5 7"
              />
              <rect
                x="44"
                y="38"
                width="156"
                height="100"
                rx="12"
                fill="#fff0bb"
                stroke="#354f6e"
                strokeWidth="2"
              />
              <path
                d="M93 66H151M93 80H134"
                stroke="#354f6e"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <circle cx="72" cy="75" r="11" fill="#354f6e" />
              <rect
                x="63"
                y="103"
                width="116"
                height="17"
                rx="4"
                fill="#ffffff"
              />
              <rect
                x="218"
                y="52"
                width="118"
                height="78"
                rx="10"
                fill="#fbe0ed"
                stroke="#354f6e"
                strokeWidth="2"
              />
              <path
                d="M247 86H308M247 101H287"
                stroke="#354f6e"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <rect
                x="120"
                y="146"
                width="152"
                height="52"
                rx="10"
                fill="#bcebd7"
                stroke="#354f6e"
                strokeWidth="2"
              />
              <circle cx="147" cy="172" r="13" fill="#126b51" />
              <path
                d="m140 172 5 5 9-10"
                stroke="#fff"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M173 167H249M173 178H229"
                stroke="#354f6e"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M310 160v20m-10-10h20M25 161v14m-7-7h14"
                stroke="#354f6e"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <h2>
              A prize for everyone.
              <br />A link for each.
            </h2>
            <p>
              Create a campaign, choose each prize, and share a personal claim
              link.
            </p>
            <div className="auth-story-tags">
              <span>
                <Icon name="campaign" size={18} />
                Your campaign
              </span>
              <span>
                <Icon name="link" size={18} />
                Their claim link
              </span>
            </div>
          </aside>
        )}
        <div className="auth-card">{children}</div>
      </main>
      <footer className="auth-footer">
        Kleym on Stellar <Link href="/status">Service status</Link>
      </footer>
    </div>
  )
}
