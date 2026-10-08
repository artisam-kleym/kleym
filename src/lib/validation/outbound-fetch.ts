import { outboundUrlFor } from './outbound-url'

export class OutboundDestinationError extends Error {
  constructor() {
    // Never include the URL, credentials, request body or provider error.
    super('Outbound destination or redirect refused.')
    this.name = 'OutboundDestinationError'
  }
}

/** Revalidate stored URLs at execution time and refuse redirects at every hop.
 * Hostname-to-IP DNS resolution still requires enforced deployment egress.
 */
export async function outboundFetch(
  input: string | URL, init: RequestInit = {}, fetchImpl: typeof fetch = fetch,
  nodeEnv = process.env.NODE_ENV ?? 'development',
): Promise<Response> {
  const checked = outboundUrlFor(nodeEnv).safeParse(String(input))
  if (!checked.success) throw new OutboundDestinationError()
  const response = await fetchImpl(checked.data, { ...init, redirect: 'error' })
  if (response.redirected || response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined)
    throw new OutboundDestinationError()
  }
  return response
}
