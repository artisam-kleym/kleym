import { describe, expect, it, vi } from 'vitest'
import { outboundUrlFor } from '@/lib/validation/outbound-url'
import { outboundFetch } from '@/lib/validation/outbound-fetch'
import { createServer } from 'node:http'

const prod = outboundUrlFor('production')
describe('production outbound canonical URL policy (#107)', () => {
  it.each([
    '127.0.0.1', 'localhost', 'LOCALHOST.', '127.1', '0177.0.0.1', '0x7f000001', '2130706433', '%31%32%37.0.0.1',
    '10.1', '172.16.0.1', '172.31.255.255', '192.168.1', '0.0.0.0', '169.254.169.254', '100.64.0.1', '100.127.255.255',
    '192.0.0.8', '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.1.2.3', '255.255.255.255',
    '[::]', '[::1]', '[::ffff:127.0.0.1]', '[::ffff:8.8.8.8]', '[fc00::1]', '[fd00::1]', '[fe80::1]', '[ff02::1]',
    '[64:ff9b::a00:1]', '[2001:db8::1]', '[2001::1]', '[2002:7f00:1::1]', '[3fff::1]',
    'db.internal', 'printer.local', 'foo.localhost', 'metadata', 'service.lan', 'home',
  ])('refuses https://%s before fetch', async (host) => {
    const url = `https://${host}/callback`, transport = vi.fn()
    expect(prod.safeParse(url).success).toBe(false)
    await expect(outboundFetch(url, {}, transport, 'production')).rejects.toThrow('refused')
    expect(transport).not.toHaveBeenCalled()
  })
  it.each(['https://hooks.example.com/events', 'https://stellar.org/', 'https://8.8.8.8/', 'https://[2001:4860:4860::8888]/', 'https://172.32.0.1:8443/'])('allows public HTTPS %s', (url) => {
    expect(prod.safeParse(url).success).toBe(true)
  })
  it('rejects credentials, alternate schemes and malformed/parser inputs with safe errors', async () => {
    for (const url of ['https://user:private@example.com/', 'https://example.com@127.0.0.1/', 'https://example.com\\@127.0.0.1/', 'http://stellar.org/', 'file:///tmp/file', 'https://[::1%25eth0]/', 'https://999.1.1.1/']) {
      const transport = vi.fn()
      expect(prod.safeParse(url).success).toBe(false)
      const error = await outboundFetch(url, {}, transport, 'production').catch((error: Error) => error)
      expect(String(error)).not.toContain('private')
      expect(transport).not.toHaveBeenCalled()
    }
  })
  it('preserves narrow isolated loopback fixtures, while refusing other private networks in development', () => {
    const local = outboundUrlFor('test')
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(local.safeParse(`http://${host}:1234/`).success).toBe(true)
      expect(local.safeParse(`https://${host}:1234/`).success).toBe(true)
      expect(prod.safeParse(`https://${host}:1234/`).success).toBe(false)
    }
    expect(local.safeParse('https://10.0.0.1/').success).toBe(false)
    expect(local.safeParse('http://example.com/').success).toBe(false)
  })
  it('forces redirect error even if the caller asks to follow, and refuses returned redirects', async () => {
    const transport = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/' } }))
    await expect(outboundFetch('https://example.com/', { redirect: 'follow' }, transport, 'production')).rejects.toThrow('refused')
    expect(transport).toHaveBeenCalledExactlyOnceWith('https://example.com/', { redirect: 'error' })
  })
  it('the real local HTTP transport never follows a redirect to a second fixture endpoint', async () => {
    let redirectedHits = 0
    const server = createServer((request, response) => {
      if (request.url === '/target') { redirectedHits++; response.writeHead(200).end('not expected'); return }
      response.writeHead(302, { location: '/target' }).end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address() as { port: number }
      await expect(outboundFetch(`http://127.0.0.1:${address.port}/redirect`, {}, fetch, 'test')).rejects.toThrow()
      expect(redirectedHits).toBe(0)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})
