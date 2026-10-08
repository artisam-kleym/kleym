import { outboundUrlFor } from './outbound-url'
import { pinnedFetch } from './pinned-fetch'

export class OutboundDestinationError extends Error {
  constructor() {
    // Never include the URL, credentials, request body or provider error.
    super('Outbound destination or redirect refused.')
    this.name = 'OutboundDestinationError'
  }
}

/** Revalidate stored URLs at execution time and refuse redirects at every hop.
 * The default HTTPS transport resolves/validates DNS at socket creation.
 * Trusted injected fixture transports and narrow nonproduction loopback retain fetch semantics.
 */
export async function outboundFetch(
  input: string | URL, init: RequestInit = {}, fetchImpl: typeof fetch = fetch,
  nodeEnv = process.env.NODE_ENV ?? 'development',
): Promise<Response> {
  const checked = outboundUrlFor(nodeEnv).safeParse(String(input))
  if (!checked.success) throw new OutboundDestinationError()
  const url = new URL(checked.data)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.replace(/\.$/, ''))
  const options = { ...init, redirect: 'error' as const }
  const response = fetchImpl === fetch && !loopback
    ? await pinnedFetch(checked.data, options)
    : await fetchImpl(checked.data, options)
  if (response.redirected || response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined)
    throw new OutboundDestinationError()
  }
  return response
}
