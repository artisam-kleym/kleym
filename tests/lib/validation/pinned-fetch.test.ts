import { beforeEach, expect, it, vi } from 'vitest'
import type { LookupAddress } from 'node:dns'
import { createServer } from 'node:http'

import { createPublicLookup, pinnedFetch } from '@/lib/validation/pinned-fetch'
const resolver = vi.fn()
const publicLookup = createPublicLookup(resolver)

beforeEach(() => resolver.mockReset())

function resolveAtSocket(all = false): Promise<unknown> {
  return new Promise((resolve, reject) => publicLookup('tenant.example', { all }, (error, address, family) => error ? reject(error) : resolve({ address, family })))
}

it('refuses every mixed private/public, reserved, mapped or empty DNS answer set', async () => {
  for (const addresses of [['8.8.8.8', '10.0.0.1'], ['127.0.0.1'], ['169.254.169.254'], ['::ffff:127.0.0.1'], ['fc00::1'], ['2001:db8::1'], []]) {
    resolver.mockResolvedValue(addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })))
    await expect(resolveAtSocket()).rejects.toThrow('refused')
  }
})

it('pins only validated answers and rechecks a public-to-private rebind on the next connection', async () => {
  const answers: LookupAddress[] = [{ address: '8.8.8.8', family: 4 }, { address: '2001:4860:4860::8888', family: 6 }]
  resolver.mockResolvedValueOnce(answers).mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])
  expect(await resolveAtSocket(true)).toEqual({ address: answers, family: undefined })
  await expect(resolveAtSocket()).rejects.toThrow('refused')
  expect(resolver).toHaveBeenNthCalledWith(1, 'tenant.example', { all: true, verbatim: true })
  expect(resolver).toHaveBeenCalledTimes(2)
})

it('the actual HTTPS connector sends no request bytes to a private resolved endpoint', async () => {
  let hits = 0
  const server = createServer((_request, response) => { hits++; response.end('unexpected') })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const port = (server.address() as { port: number }).port
    resolver.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    await expect(pinnedFetch(`https://tenant.example:${port}/`, { method: 'POST', body: 'inert test payload' }, publicLookup)).rejects.toThrow('refused')
    expect(resolver).toHaveBeenCalled()
    expect(hits).toBe(0)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

it('preserves safe transport errors on DNS failure and honours an already-aborted request', async () => {
  const failingLookup = createPublicLookup(async () => { throw new Error('provider detail must not escape') })
  await expect(pinnedFetch('https://tenant.example/', {}, failingLookup)).rejects.toThrow('Outbound destination or transport refused.')
  const controller = new AbortController(); controller.abort()
  await expect(pinnedFetch('https://tenant.example/', { signal: controller.signal })).rejects.toThrow('refused')
})
