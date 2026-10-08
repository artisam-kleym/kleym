import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'
vi.mock('@/lib/db/client', () => ({ prisma: {} }))
import { sessionCookieOptions } from '@/lib/auth/session'

afterEach(() => vi.unstubAllEnvs())
describe('Lantern embedding headers and session policy', () => {
  it('keeps framing denied and Lax sessions while disabled', () => {
    vi.stubEnv('LANTERN_ORIGINS','')
    const response=middleware(new NextRequest('https://kleym.example/claim'))
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(sessionCookieOptions(new Date())).toMatchObject({httpOnly:true,secure:true,sameSite:'lax',path:'/'})
    expect(sessionCookieOptions(new Date())).not.toHaveProperty('partitioned')
  })
  it('uses exact trusted ancestors and partitioned Secure sessions when enabled', () => {
    vi.stubEnv('LANTERN_ORIGINS','https://android.golantern.xyz')
    const response=middleware(new NextRequest('https://kleym.example/campaigns/new'))
    expect(response.headers.get('x-frame-options')).toBeNull()
    expect(response.headers.get('content-security-policy')).toContain('frame-ancestors https://android.golantern.xyz')
    expect(sessionCookieOptions(new Date())).toMatchObject({httpOnly:true,secure:true,sameSite:'none',partitioned:true,path:'/'})
  })
  it('keeps administrative routes unframeable and secrets no-referrer', () => {
    vi.stubEnv('LANTERN_ORIGINS','https://android.golantern.xyz')
    const admin=middleware(new NextRequest('https://kleym.example/admin'))
    expect(admin.headers.get('x-frame-options')).toBe('DENY')
    expect(admin.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(middleware(new NextRequest('https://kleym.example/claim')).headers.get('referrer-policy')).toBe('no-referrer')
  })
  it('refuses cross-origin and originless cookie writes with RFC9457 response', async () => {
    vi.stubEnv('LANTERN_ORIGINS','https://android.golantern.xyz');vi.stubEnv('APP_URL','https://kleym.example')
    for(const origin of ['https://evil.com','https://android.golantern.xyz',undefined]) {
      const request=new NextRequest('https://kleym.example/api/campaigns',{method:'POST',headers:{cookie:'__Host-kleym_session=opaque',...(origin?{origin}:{})}})
      const response=middleware(request)
      expect(response.status).toBe(403);expect(response.headers.get('content-type')).toContain('application/problem+json')
      expect(await response.json()).toMatchObject({status:403,correlationId:expect.any(String)})
    }
    expect(middleware(new NextRequest('https://kleym.example/api/campaigns',{method:'POST',headers:{origin:'https://kleym.example',cookie:'__Host-kleym_session=opaque'}})).status).toBe(200)
  })
})
