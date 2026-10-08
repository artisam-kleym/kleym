import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import Decimal from 'decimal.js'
import { attemptDelivery } from '@/lib/webhooks/deliver'
import { screeningGate, SCREENING_DETAIL } from '@/lib/api/screening'
import { beginAuthorization, completeAuthorization, discover, forgetDiscovery } from '@/lib/auth/sso/oidc'
import { encryptAtRest } from '@/lib/auth/at-rest'

const fixture = vi.hoisted(() => ({
  campaign: { findUnique: vi.fn(), update: vi.fn() },
  webhookDelivery: { findUnique: vi.fn(), update: vi.fn() }, webhookEndpoint: { update: vi.fn() }, $transaction: vi.fn(),
  redis: { set: vi.fn(), get: vi.fn(), del: vi.fn() }, audit: vi.fn(),
}))
vi.mock('@/lib/db/client', () => ({ prisma: fixture }))
vi.mock('@/lib/redis/client', () => ({ redis: fixture.redis }))
vi.mock('@/lib/api/audit', () => ({ recordAudit: fixture.audit }))
vi.mock('@/lib/config/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

const issuer = 'https://auth.example.net'
const doc = { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, userinfo_endpoint: `${issuer}/userinfo` }
const flowRows = new Map<string, string>()
beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  forgetDiscovery(issuer)
  flowRows.clear()
  fixture.redis.set.mockImplementation(async (key: string, value: string) => { flowRows.set(key, value) })
  fixture.redis.get.mockImplementation(async (key: string) => flowRows.get(key) ?? null)
  fixture.redis.del.mockImplementation(async (key: string) => { flowRows.delete(key) })
  fixture.$transaction.mockImplementation(async (actions: unknown[]) => Promise.all(actions))
  fixture.webhookDelivery.findUnique.mockResolvedValue({ id: 'delivery', event: 'link.claimed', payload: { public: 'event' }, status: 'QUEUED',
    endpoint: { id: 'endpoint', url: 'https://10.0.0.8/hooks', signingKey: 'throwaway-fixture', disabledAt: null, failures: 0 } })
  fixture.campaign.findUnique.mockResolvedValue({ id: 'campaign', name: 'Prizes', network: 'testnet', assetCode: 'XLM', assetIssuer: null,
    amountPerLink: new Decimal(1), linkCount: 1, expiresAt: new Date(Date.now() + 3600000), user: { username: 'sender' },
    organization: { id: 'org', name: 'Org', screeningUrl: 'https://169.254.169.254/check' }, links: [],
    screeningDecision: null, screeningReason: null, screeningHash: null })
})

describe('stored outbound destinations are revalidated at consumer boundaries', () => {
  it('records a refused legacy webhook without sending its payload or signing header', async () => {
    const transport = vi.fn()
    expect(await attemptDelivery('delivery', 1, false, { fetch: transport })).toMatchObject({ kind: 'failed', status: null, reason: 'destination or transport failure' })
    expect(transport).not.toHaveBeenCalled()
    expect(fixture.webhookDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }))
  })
  it('allows a public webhook and refuses redirect responses without following them', async () => {
    const row = await fixture.webhookDelivery.findUnique()
    row.endpoint.url = 'https://hooks.example.net/events'
    const transport = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/' } }))
    expect((await attemptDelivery('delivery', 1, false, { fetch: transport })).kind).toBe('failed')
    expect(transport.mock.calls[0]![1]).toMatchObject({ method: 'POST', redirect: 'error' })
    transport.mockResolvedValue(new Response(null, { status: 204 }))
    expect((await attemptDelivery('delivery', 2, false, { fetch: transport })).kind).toBe('delivered')
  })
  it('holds screening for a private stored URL without sending recipient data', async () => {
    const transport = vi.fn()
    expect(await screeningGate('campaign', { fresh: true }, { fetch: transport })).toBe(SCREENING_DETAIL.unavailable)
    expect(transport).not.toHaveBeenCalled()
    expect(fixture.campaign.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ screeningDecision: 'HOLD' }) }))
  })
  it('keeps public screening working and holds a public-to-private redirect', async () => {
    const row = await fixture.campaign.findUnique()
    row.organization.screeningUrl = 'https://screen.example.net/check'
    const transport = vi.fn().mockResolvedValue(Response.json({ decision: 'allow' }))
    expect(await screeningGate('campaign', { fresh: true }, { fetch: transport })).toBeNull()
    expect(transport.mock.calls[0]![1]).toMatchObject({ method: 'POST', redirect: 'error' })
    transport.mockResolvedValue(new Response(null, { status: 307, headers: { location: 'https://10.0.0.1/' } }))
    expect(await screeningGate('campaign', { fresh: true }, { fetch: transport })).toBe(SCREENING_DETAIL.unavailable)
  })
  it('refuses private OIDC issuers before discovery and keeps test cache out of production', async () => {
    const local = 'http://127.0.0.1:4321'
    const transport = vi.fn().mockResolvedValue(Response.json({ issuer: local, authorization_endpoint: `${local}/authorize`, token_endpoint: `${local}/token`, jwks_uri: `${local}/jwks` }))
    await discover(local, transport, 'test')
    transport.mockClear()
    await expect(discover(local, transport, 'production')).rejects.toMatchObject({ reason: 'endpoint-refused' })
    expect(transport).not.toHaveBeenCalled()
    forgetDiscovery(local)
    await expect(discover('https://0x7f000001/', transport, 'production')).rejects.toMatchObject({ reason: 'endpoint-refused' })
    expect(transport).not.toHaveBeenCalled()
  })
  it('rejects a private advertised token endpoint and a redirecting discovery host', async () => {
    const transport = vi.fn().mockResolvedValue(Response.json({ ...doc, token_endpoint: 'https://[::ffff:127.0.0.1]/token' }))
    await expect(discover(issuer, transport, 'production')).rejects.toMatchObject({ reason: 'endpoint-refused' })
    transport.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/' } }))
    await expect(discover(issuer, transport, 'production')).rejects.toMatchObject({ reason: 'unreachable' })
    expect(transport).toHaveBeenCalledTimes(2)
  })
  it('uses the guarded custom fetch for token, JWKS and userinfo; never falls back to global fetch', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const jwk = { ...await exportJWK(publicKey), kid: 'fixture', alg: 'RS256' }
    const connection = { id: 'connection', issuer, clientId: 'fixture-client', clientCiphertext: encryptAtRest('throwaway-client-secret'),
      scopes: 'openid', subjectClaim: 'sub', groupsClaim: 'groups' }
    let token = ''
    const transport = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('openid-configuration')) return Response.json(doc)
      if (url === doc.token_endpoint) return Response.json({ id_token: token, access_token: 'throwaway-access-token' })
      if (url === doc.jwks_uri) return Response.json({ keys: [jwk] })
      if (url === doc.userinfo_endpoint) return Response.json({ sub: 'fixture-user', groups: ['prize-operators'] })
      throw new Error('unexpected fixture request')
    })
    const globalTransport = vi.fn().mockRejectedValue(new Error('global network is forbidden in this test'))
    vi.stubGlobal('fetch', globalTransport)
    try {
      const started = await beginAuthorization(connection, 'login', undefined, transport)
      token = await new SignJWT({ nonce: new URL(started.url).searchParams.get('nonce') }).setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
        .setSubject('fixture-user').setIssuer(issuer).setAudience(connection.clientId).setIssuedAt().setExpirationTime('2m').sign(privateKey)
      expect(await completeAuthorization(async () => connection, { code: 'fixture-code', state: started.state }, transport)).toMatchObject({ ok: true, claims: { subject: 'fixture-user', groups: ['prize-operators'] } })
      expect(transport.mock.calls.map(([url]) => String(url))).toEqual([`${issuer}/.well-known/openid-configuration`, doc.token_endpoint, doc.jwks_uri, doc.userinfo_endpoint])
      for (const call of transport.mock.calls) expect((call as unknown as [unknown, RequestInit])[1].redirect).toBe('error')
      expect(globalTransport).not.toHaveBeenCalled()
    } finally { vi.unstubAllGlobals() }
  })
})
