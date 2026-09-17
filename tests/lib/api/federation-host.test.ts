import { describe, expect, it } from 'vitest'
import { isPublicHost } from '@/app/api/claims/federation/route'

/* #75 review: the federation lookup is a server-side fetch to a caller-named host. */
describe('isPublicHost', () => {
  it('accepts ordinary public domains', () => {
    for (const host of ['exchange.com', 'stellar.org', 'my-exchange.co.uk', 'a.b.c.example']) expect(isPublicHost(host)).toBe(true)
  })

  it('refuses IP literals in private, loopback, link-local and reserved ranges', () => {
    for (const host of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '[::1]', '::1']) {
      expect(isPublicHost(host)).toBe(false)
    }
  })

  it('refuses local names and ports', () => {
    for (const host of ['localhost', 'db.internal', 'printer.local', 'foo.localhost', 'host:8080', '']) expect(isPublicHost(host)).toBe(false)
  })
})
