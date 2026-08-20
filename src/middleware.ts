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

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
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
