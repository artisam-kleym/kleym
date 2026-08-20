/**
 * Self-hosted fonts. BRAND.md §9.10 and SPEC.md §3.6.
 *
 * Not a convenience: /claim must issue ZERO third-party network requests, and a
 * Google Fonts CDN link is exactly that. Loading them here means every route
 * is CDN-free, so the rule cannot be broken by someone adding a font to a
 * shared layout later.
 *
 * The icon font is subsetted to the icons BRAND.md §6 names — 24K rather than
 * the 3.8MB full variable font — with the FILL, GRAD, opsz and wght axes kept.
 */
import localFont from 'next/font/local'

export const inter = localFont({
  src: '../fonts/inter-latin.woff2',
  variable: '--font-sans',
  display: 'swap',
  weight: '100 900',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
})

export const jetbrainsMono = localFont({
  src: '../fonts/jetbrains-mono-latin.woff2',
  variable: '--font-mono',
  display: 'swap',
  weight: '100 800',
  fallback: ['ui-monospace', 'SFMono-Regular', 'monospace'],
})

export const materialSymbols = localFont({
  src: '../fonts/material-symbols-subset.woff2',
  variable: '--font-icons',
  // `block`, not `swap`: an icon rendered as its ligature text ("account_balance_wallet")
  // is worse than a brief blank box.
  display: 'block',
  weight: '100 700',
})
