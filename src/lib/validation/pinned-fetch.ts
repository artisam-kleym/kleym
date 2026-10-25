import { lookup } from 'node:dns/promises'
import type { LookupAddress } from 'node:dns'
import { request as httpsRequest } from 'node:https'
import type { LookupFunction } from 'node:net'
import { isPublicHostname } from './public-host'

const refused = () => new Error('Outbound destination or transport refused.')

/** Resolve at socket creation. The connector consumes this exact result, without a second DNS lookup. */
export function createPublicLookup(resolveAddresses: (hostname: string, options: { all: true; verbatim: true }) => Promise<LookupAddress[]> = lookup): LookupFunction {
  return (hostname, options, callback) => {
    void resolveAddresses(hostname, { all: true, verbatim: true }).then((answers) => {
      if (!answers.length || answers.some(({ address }) => !isPublicHostname(address.includes(':') ? `[${address}]` : address))) {
        callback(refused(), '', 0); return
      }
      const compatible = options.family ? answers.filter((answer) => answer.family === options.family) : answers
      if (!compatible.length) { callback(refused(), '', 0); return }
      if (options.all) callback(null, compatible)
      else callback(null, compatible[0]!.address, compatible[0]!.family)
    }).catch(() => callback(refused(), '', 0))
  }
}
export const publicLookup = createPublicLookup()

/** Tenant integrations use bounded HTTPS and pinned public DNS, with normal hostname/TLS validation.
 * Uses a direct connector with no shared connection pool. Caller signals remain authoritative.
 */
export async function pinnedFetch(url: string, init: RequestInit, connectLookup: LookupFunction = publicLookup): Promise<Response> {
  const request = new Request(url, init)
  if (request.signal.aborted) throw refused()
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : null
  if (body && body.length > 1_048_576) throw refused()
  const headers = Object.fromEntries(request.headers)
  headers.host = new URL(url).host
  headers['accept-encoding'] = 'identity'
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)])
  return new Promise<Response>((resolve, reject) => {
    const outgoing = httpsRequest(url, { method: request.method, headers, lookup: connectLookup, agent: false, signal }, (incoming) => {
      const encoding = incoming.headers['content-encoding']
      if (encoding !== undefined && (typeof encoding !== 'string' || encoding.trim().toLowerCase() !== 'identity')) { incoming.destroy(); reject(refused()); return }
      const chunks: Buffer[] = []
      let size = 0
      const status = incoming.statusCode ?? 502
      if (status < 200 || status > 599 || status >= 300 && status < 400) { incoming.destroy(); reject(refused()); return }
      incoming.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > 2_097_152) { incoming.destroy(refused()); return }
        chunks.push(chunk)
      })
      incoming.on('error', () => reject(refused()))
      incoming.on('aborted', () => reject(refused()))
      incoming.on('end', () => {
        try {
          const responseHeaders = new Headers()
          for (const [key, value] of Object.entries(incoming.headers)) {
            if (value !== undefined) for (const entry of Array.isArray(value) ? value : [value]) responseHeaders.append(key, entry)
          }
          resolve(new Response(request.method === 'HEAD' || [204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers: responseHeaders }))
        } catch { reject(refused()) }
      })
    })
    outgoing.on('error', () => reject(refused()))
    outgoing.end(body)
  })
}
