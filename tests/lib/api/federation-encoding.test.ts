import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { POST } from '@/app/api/claims/federation/route'

const transport = vi.hoisted(() => vi.fn())
vi.mock('@/lib/validation/outbound-fetch', () => ({ outboundFetch: transport }))
vi.mock('@/lib/auth/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }))
vi.mock('@/lib/security/guard', () => ({ guardRequestBody: vi.fn(() => null) }))
vi.mock('@/lib/config/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

const address = Keypair.random().publicKey()
const toml = 'FEDERATION_SERVER="https://federation.example.com/resolve"'
const invoke = () => POST(new Request('https://kleym.example/api/claims/federation', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: 'worker*example.com' }),
}))
beforeEach(() => transport.mockReset())

describe('federation responses are identity-only on both hops (#136)', () => {
  for (const hop of [0, 1]) for (const encoding of ['br', 'gzip', 'deflate', 'identity, br', '']) {
    it(`refuses encoding ${JSON.stringify(encoding)} on hop ${hop + 1} before reading its body`, async () => {
      const encoded = new Response('untrusted response bytes', { headers: { 'content-encoding': encoding } })
      const read = vi.spyOn(encoded.body!, 'getReader')
      const cancel = vi.spyOn(encoded.body!, 'cancel')
      if (hop === 1) transport.mockResolvedValueOnce(new Response(toml))
      transport.mockResolvedValueOnce(encoded)
      const response = await invoke()
      expect(response.status).toBe(409)
      expect((await response.json()).detail).toBe('That address could not be looked up. Check it with your exchange, or enter the deposit address and memo directly.')
      expect(read).not.toHaveBeenCalled()
      expect(cancel).toHaveBeenCalledOnce()
      expect(transport).toHaveBeenCalledTimes(hop + 1)
    })
  }
  it.each([undefined, 'identity', ' Identity '])('continues normal federation without decoding for %s', async (encoding) => {
    const headers: Record<string, string> = encoding === undefined ? {} : { 'content-encoding': encoding }
    transport.mockResolvedValueOnce(new Response(toml, { headers }))
      .mockResolvedValueOnce(Response.json({ account_id: address, memo_type: 'id', memo: '123' }, { headers }))
    const response = await invoke()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ accountId: address, memo: { type: 'id', value: '123' } })
    for (const [, options] of transport.mock.calls) expect(options).toMatchObject({ redirect: 'error', headers: { 'accept-encoding': 'identity' } })
  })
})
