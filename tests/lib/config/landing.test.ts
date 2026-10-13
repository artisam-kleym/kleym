import { describe, expect, it } from 'vitest'
import { landingConfiguration, landingOrigin } from '../../../landing/config'
import { appEntryPath } from '@/lib/config/app-entry'

describe('separate website and app configuration', () => {
  it('builds from public values without database, session or sponsor settings', () => {
    expect(landingConfiguration({})).toEqual({
      appOrigin: 'https://app.kleym.xyz',
      siteOrigin: 'https://kleym.xyz',
      network: 'testnet',
    })
  })
  it('rejects credentials, private hosts, paths, queries, fragments and unsafe protocols', () => {
    for (const origin of [
      'http://kleym.xyz',
      'https://user:password@kleym.xyz',
      'https://kleym.xyz/login',
      'https://kleym.xyz/?token=private',
      'https://kleym.xyz/#private',
      'https://127.0.0.1',
      'https://localhost',
      'https://foo.internal',
      'javascript:alert(1)',
    ]) {
      expect(() => landingOrigin(origin)).toThrow()
    }
    expect(() => landingOrigin('private-token-instead-of-url')).toThrow(
      'Landing URLs must be valid public HTTPS origins.',
    )
    expect(() =>
      landingOrigin('https://' + 'S' + 'A'.repeat(55) + '.example'),
    ).toThrow('Landing URLs must not contain wallet keys.')
  })
  it('allows localhost only with explicit local qualification opt-in', () => {
    expect(landingOrigin('http://127.0.0.1:3228', true)).toBe(
      'http://127.0.0.1:3228',
    )
    expect(() => landingOrigin('http://kleym.xyz', true)).toThrow()
  })
  it('keeps Testnet as default and rejects unknown network labels', () => {
    expect(() => landingConfiguration({ LANDING_NETWORK: 'mainnet' })).toThrow()
    expect(landingConfiguration({ LANDING_NETWORK: 'public' }).network).toBe(
      'public',
    )
  })
  it('routes app entry according to the actual authentication state', () => {
    expect(appEntryPath(null)).toBe('/login')
    expect(appEntryPath('ok')).toBe('/dashboard')
    expect(appEntryPath('mfa-pending')).toBe('/login/mfa')
    expect(appEntryPath('enrol-required')).toBe('/settings/security?required=1')
  })
})
