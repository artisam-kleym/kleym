import { describe, expect, it } from 'vitest'
import { federationServerOf, isPublicHost, memoFromRecord } from '@/lib/stellar/federation'

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

  it('refuses every spelling the URL parser reads as a private address — shorthand, octal, hex, overlong', () => {
    for (const host of ['127.1', '10.1', '0177.0.0.1', '0x7f.0.0.1', '0x7f000001', '2130706433', '192.168.1', '999.1.1.1', 'user@example.com']) {
      expect(isPublicHost(host)).toBe(false)
    }
  })

  it('refuses local names and ports', () => {
    for (const host of ['localhost', 'db.internal', 'printer.local', 'foo.localhost', 'host:8080', '']) expect(isPublicHost(host)).toBe(false)
  })
})

describe('federationServerOf', () => {
  it('reads the top-level key and stops at the first table', () => {
    expect(federationServerOf('VERSION="2.0.0"\nFEDERATION_SERVER="https://fed.exchange.com/api"\n[DOCUMENTATION]\nORG_NAME="x"')).toBe('https://fed.exchange.com/api')
    expect(federationServerOf("FEDERATION_SERVER = 'https://fed.exchange.com/api'")).toBe('https://fed.exchange.com/api')
    expect(federationServerOf('[DOCUMENTATION]\nFEDERATION_SERVER="https://fed.exchange.com/api"')).toBeNull()
    expect(federationServerOf('NETWORK_PASSPHRASE="x"')).toBeNull()
  })
})

describe('memoFromRecord', () => {
  it('relays id and text memos, decoding a base64 hash to the hex TX2 carries', () => {
    expect(memoFromRecord({ memo_type: 'id', memo: '12345' })).toEqual({ type: 'id', value: '12345' })
    expect(memoFromRecord({ memo_type: 'id', memo: 12345 })).toEqual({ type: 'id', value: '12345' })
    expect(memoFromRecord({ memo_type: 'text', memo: 'abc' })).toEqual({ type: 'text', value: 'abc' })
    const hex = 'ab'.repeat(32)
    expect(memoFromRecord({ memo_type: 'hash', memo: Buffer.from(hex, 'hex').toString('base64') })).toEqual({ type: 'hash', value: hex })
  })

  it('refuses what it cannot relay faithfully — an unsafe number, a short hash, an unknown type', () => {
    expect(memoFromRecord({ memo_type: 'id', memo: 2 ** 53 + 2 })).toBeNull()
    expect(memoFromRecord({ memo_type: 'id', memo: -1 })).toBeNull()
    expect(memoFromRecord({ memo_type: 'hash', memo: 'AAAA' })).toBeNull()
    expect(memoFromRecord({ memo_type: 'return', memo: 'x' })).toBeNull()
    expect(memoFromRecord({ memo_type: 'id' })).toBeNull()
  })
})
