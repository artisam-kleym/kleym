import { describe, expect, it, vi } from 'vitest'
import { freighterPairingLink, isPhoneBrowser, openFreighterApp } from '@/lib/wallet/phone'

const pairing = `wc:${'a'.repeat(64)}@2?relay-protocol=irn&symKey=${'b'.repeat(64)}&expiryTimestamp=1791040000`

describe('phone connection routing', () => {
  it.each(['Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', 'Mozilla/5.0 (iPad; CPU OS 18_0)'])('offers the phone route for %s', userAgent => {
    expect(isPhoneBrowser({ userAgent })).toBe(true)
  })
  it('recognizes iPad desktop mode and Freighter in-app browsing', () => {
    expect(isPhoneBrowser({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
    expect(isPhoneBrowser({ userAgent: 'Desktop' }, true)).toBe(true)
  })
  it('keeps real desktops on the extension route irrespective of viewport width', () => {
    expect(isPhoneBrowser({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe(false)
    expect(isPhoneBrowser({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
  })
  it('uses the verified app route and passes only the exact encoded pairing URI', () => {
    const link = new URL(freighterPairingLink(pairing))
    expect(link.protocol).toBe('freighterwallet:')
    expect(link.host).toBe('wc-redirect')
    expect([...link.searchParams.keys()]).toEqual(['uri'])
    expect(link.searchParams.get('uri')).toBe(pairing)
  })
  it.each(['javascript:alert(1)', 'https://kleym.example/claim#private', `${pairing}#private`, pairing.replace('@2', '@1'), pairing.replace('relay-protocol=irn', 'relay-protocol=other'), pairing.replace('b'.repeat(64), 'short'), `${pairing}&symKey=${'c'.repeat(64)}`])('refuses malformed or substituted connection data without echoing it', uri => {
    expect(() => freighterPairingLink(uri)).toThrow('The phone connection code is invalid.')
  })
  it('does not open a substituted app route or a private claim URL', () => {
    const open = vi.fn()
    vi.stubGlobal('window', { open })
    try {
      for (const link of ['https://kleym.example/claim#private', 'javascript:alert(1)', freighterPairingLink(pairing).replace('wc-redirect', 'other-route')]) {
        expect(() => openFreighterApp(link)).toThrow()
      }
      expect(open).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
