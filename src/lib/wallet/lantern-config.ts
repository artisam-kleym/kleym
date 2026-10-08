/** Shared policy for embedding and the wallet bridge. Never accept a whole scheme. */
export function parseLanternOrigins(raw: string | undefined): string[] {
  return [...new Set((raw ?? '').split(/[\s,]+/).filter(Boolean).filter((value) =>
    value === 'https://android.golantern.xyz' || /^chrome-extension:\/\/[a-p]{32}$/.test(value),
  ))]
}

export function lanternFrameAllowed(path: string): boolean {
  return path === '/' || ['/login', '/mfa', '/dashboard', '/campaigns', '/settings', '/claim', '/organizations'].some((route) => path === route || path.startsWith(`${route}/`))
}

/** Cookie-bearing mutations still originate from Kleym, even inside a frame. */
export function embeddedMutationAllowed(request: { method: string; headers: Headers; url: string }, appUrl: string): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true
  const origin = request.headers.get('origin')
  if (origin) return origin === new URL(appUrl).origin
  // Preserve non-browser workers / token API callers; cookie requests require Origin.
  return !request.headers.get('cookie') && !new URL(request.url).pathname.startsWith('/api/auth/')
}

export function lanternIntentUrl(target: string): string {
  const url = new URL(target)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.pathname.startsWith('/claim') || !lanternFrameAllowed(url.pathname)) {
    throw new Error('Open campaigns in Lantern using a public HTTPS address. Keep private claim links in their original tab.')
  }
  // Handoff restarts at this public page; authentication codes and URL query
  // tokens must not be forwarded to another application's intent handler.
  url.search = ''
  const encoded = encodeURIComponent(url.href)
  return `intent://open?url=${encoded}#Intent;scheme=lantern;package=com.lantern.wallet;S.browser_fallback_url=${encoded};end`
}
