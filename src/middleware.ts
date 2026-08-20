/**
 * Global security headers. AGENT.md §5.3.
 *
 * Runs on every request. The CSP is nonce-based with no `unsafe-inline` and no
 * `unsafe-eval` — an inline-script allowance would defeat the point on /claim,
 * which handles bearer secrets.
 */
import { NextResponse, type NextRequest } from 'next/server'

/** Routes that handle a URL-fragment secret and must leak nothing outward. */
const FRAGMENT_SECRET_ROUTES = ['/claim']

function isFragmentSecretRoute(pathname: string): boolean {
  return FRAGMENT_SECRET_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

export function middleware(request: NextRequest) {
  // 128 bits of nonce per response. Uint8Array -> base64 without Buffer, since
  // middleware runs on the edge runtime where Buffer is not guaranteed.
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16))
  const nonce = btoa(String.fromCharCode(...nonceBytes))

  /*
   * script-src is deliberately NOT 'strict-dynamic'.
   *
   * That directive tells a CSP3 browser to ignore 'self' and trust only
   * nonce-carrying scripts — but statically prerendered routes have their HTML
   * generated at BUILD time, so a per-request nonce can never appear in it.
   * The result is every chunk refused and no hydration, while the page still
   * returns 200. 'self' permits the same-origin chunks instead; the nonce
   * still covers inline scripts Next emits on dynamic routes.
   *
   * Neither inline script nor eval is permitted, per AGENT.md §5.3.
   *
   * This comment lives ABOVE the array on purpose: CI scans the array for
   * those directive names, and prose inside it trips the guard.
   */
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'", // fonts are self-hosted; no CDN, on any route
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  /*
   * Next reads the nonce out of a Content-Security-Policy header on the
   * REQUEST, and stamps it onto the script tags it emits. Without this line
   * nothing carries a nonce — and because 'strict-dynamic' tells a CSP3 browser
   * to ignore 'self', every chunk is then blocked and the app never hydrates.
   * The page still returns 200, which is why a status check does not test this.
   */
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  )

  // SPEC.md §3.6: the claim page must not leak a fragment-bearing URL to any
  // third party via the Referer header. Browsers do not send fragments, but the
  // path itself is still worth withholding.
  response.headers.set(
    'Referrer-Policy',
    isFragmentSecretRoute(request.nextUrl.pathname) ? 'no-referrer' : 'strict-origin-when-cross-origin',
  )

  return response
}

export const config = {
  // Everything except Next's own static output, which is served with its own
  // headers and cannot carry a per-request nonce.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
