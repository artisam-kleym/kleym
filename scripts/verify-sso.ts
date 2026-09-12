/**
 * Verification for SSO and SCIM (#46). Real Postgres and Redis; a local
 * OpenID Provider (discovery, token, JWKS, userinfo) signing real RS256 ID
 * tokens; the SCIM and login route handlers invoked in-process.
 *
 * What is proven: a user in an OIDC-connected organisation signs in with no
 * Kleym password and gets a normal Kleym session; "SSO only" refuses
 * password sign-in at the API, and identically for a right and a wrong
 * password; a SCIM deactivation ends the membership and revokes every live
 * session in one request; group-to-role mapping assigns the role from the
 * ID token and from SCIM groups, and a group change is reflected on the
 * next sync; an unknown subject whose email matches a local account is
 * refused, verified email or not, until the account links explicitly; no
 * IdP token or client secret reaches a cookie, a row or a log line.
 *
 * Run: pnpm verify:sso
 */
import { createHash, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()

const stdoutLines: string[] = []
const realWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
  stdoutLines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
  return (realWrite as (c: string | Uint8Array, ...r: unknown[]) => boolean)(chunk, ...rest)
}) as typeof process.stdout.write

/* ── a local OpenID Provider ───────────────────────────────────────────── */

const { privateKey, publicKey } = await generateKeyPair('RS256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
const RUN = randomUUID().slice(0, 8)
const CLIENT_ID = 'kleym-client'
const CLIENT_SECRET = `secret-${randomUUID()}`
const idp = {
  issuer: '',
  /** Discovery-document misbehaviour for the tests below. */
  docMode: 'ok' as 'ok' | 'claims-other-issuer' | 'loopback-token-endpoint',
  userinfoSub: null as string | null,
  /** What the next ID token asserts. */
  claims: {} as Record<string, unknown>,
  codes: new Map<string, { nonce: string; challenge: string }>(),
  issued: [] as string[],
  tokenRequests: [] as URLSearchParams[],
}
const server: Server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (url.pathname === '/.well-known/openid-configuration') {
    const doc = { issuer: idp.issuer, authorization_endpoint: `${idp.issuer}/authorize`, token_endpoint: `${idp.issuer}/token`, jwks_uri: `${idp.issuer}/jwks`, userinfo_endpoint: `${idp.issuer}/userinfo` }
    if (idp.docMode === 'claims-other-issuer') doc.issuer = 'https://accounts.google.com'
    if (idp.docMode === 'loopback-token-endpoint') doc.token_endpoint = 'http://127.0.0.1:3000/internal'
    return json(200, doc)
  }
  if (url.pathname === '/jwks') return json(200, { keys: [jwk] })
  if (url.pathname === '/userinfo') return json(200, { sub: idp.userinfoSub ?? idp.claims.sub, groups: idp.claims.groups ?? [], userinfoGroups: ['from-userinfo'] })
  if (url.pathname === '/token' && req.method === 'POST') {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', async () => {
      const form = new URLSearchParams(raw)
      idp.tokenRequests.push(form)
      const code = idp.codes.get(form.get('code') ?? '')
      if (!code) return json(400, { error: 'invalid_grant' })
      idp.codes.delete(form.get('code')!)
      if (form.get('client_secret') !== CLIENT_SECRET) return json(401, { error: 'invalid_client' })
      const verifier = form.get('code_verifier') ?? ''
      if (createHash('sha256').update(verifier).digest('base64url') !== code.challenge) return json(400, { error: 'invalid_grant', error_description: 'pkce' })
      const { sub, ...rest } = idp.claims
      const idToken = await new SignJWT({ ...rest, nonce: code.nonce })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer((rest.iss as string | undefined) ?? idp.issuer)
        .setAudience((rest.aud as string | undefined) ?? CLIENT_ID)
        .setSubject(String(sub))
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey)
      const accessToken = `at-${randomUUID()}`
      idp.issued.push(idToken, accessToken)
      json(200, { id_token: idToken, access_token: accessToken, refresh_token: `rt-${randomUUID()}`, token_type: 'Bearer' })
    })
    return
  }
  json(404, {})
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
idp.issuer = `http://127.0.0.1:${(server.address() as { port: number }).port}`

/** What a browser would do: follow the authorize URL, come back with a code. */
function authorize(startUrl: string): { code: string; state: string } {
  const u = new URL(startUrl)
  const code = `code-${randomUUID()}`
  idp.codes.set(code, { nonce: u.searchParams.get('nonce')!, challenge: u.searchParams.get('code_challenge')! })
  return { code, state: u.searchParams.get('state')! }
}

const { prisma } = await import('../src/lib/db/client')
const { logger } = await import('../src/lib/config/logger')
const { hashPassword } = await import('../src/lib/auth/password')
const { createSession } = await import('../src/lib/auth/session')
/** The session row a token resolves to — a script holds tokens, not a cookie jar. */
const resolveSessionByToken = async (token: string) => {
  const row = await prisma.session.findUnique({ where: { tokenHash: createHash('sha256').update(token).digest('hex') }, select: { userId: true, expiresAt: true } })
  return row && row.expiresAt.getTime() > Date.now() ? { user: { id: row.userId } } : null
}
const { beginAuthorization, completeAuthorization, discover, forgetDiscovery, DiscoveryError } = await import('../src/lib/auth/sso/oidc')
const { resolveIdentity, linkIdentity, ssoOnlyFor, roleFor } = await import('../src/lib/auth/sso/accounts')
const { upsertConnection, connectionForOrg, asOidc, asRoleSource } = await import('../src/lib/auth/sso/connections')
const { issueScimToken } = await import('../src/lib/auth/sso/scim')
const { decryptAtRest } = await import('../src/lib/auth/at-rest')
const loginRoute = await import('../src/app/api/auth/login/route')
const usersRoute = await import('../src/app/api/scim/v2/Users/route')
const userRoute = await import('../src/app/api/scim/v2/Users/[id]/route')
const groupsRoute = await import('../src/app/api/scim/v2/Groups/route')
const groupRoute = await import('../src/app/api/scim/v2/Groups/[id]/route')

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/* ── fixtures ──────────────────────────────────────────────────────────── */

async function tenant(mappings: { group: string; role: 'VIEWER' | 'OPERATOR' | 'APPROVER' | 'OWNER' }[] = [], ssoOnly = false) {
  const owner = await prisma.user.create({ data: { username: `owner-${randomUUID().slice(0, 8)}`, passwordHash: await hashPassword('correct horse'), role: 'SENDER' }, select: { id: true, username: true } })
  const orgId = await personalOrg(prisma, owner.id)
  const org = { id: orgId, name: 'sso', role: 'OWNER' as const, approvalThreshold: null, approvalsRequired: 1, screeningUrl: null, mfaPolicy: 'OFF' as const }
  const handle = `acme-${randomUUID().slice(0, 6)}`
  const saved = await upsertConnection(owner.id, org, { handle, issuer: idp.issuer, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, scopes: 'openid profile email', subjectClaim: 'sub', groupsClaim: 'groups', ssoOnly, defaultRole: 'VIEWER', mappings }, null)
  if (saved.kind !== 'ok') throw new Error(`connection: ${JSON.stringify(saved)}`)
  const connection = (await connectionForOrg(orgId))!
  return { owner, orgId, org, handle, connection }
}

/** The whole browser round trip, at the library level: start → IdP → callback. */
async function signIn(connection: NonNullable<Awaited<ReturnType<typeof connectionForOrg>>>, claims: Record<string, unknown>) {
  idp.claims = claims
  let url: string
  try {
    url = (await beginAuthorization(asOidc(connection), 'login')).url
  } catch (error) {
    // The start route turns this into a redirect back to /login/sso?error=idp.
    return { result: { ok: false as const, reason: error instanceof DiscoveryError ? (`discovery:${error.reason}` as const) : ('discovery:unknown' as const) }, outcome: null, state: '' }
  }
  const { code, state } = authorize(url)
  const result = await completeAuthorization(async (id) => (id === connection.id ? asOidc(connection) : null), { code, state })
  if (!result.ok) return { result, outcome: null, state }
  const outcome = await resolveIdentity(asRoleSource(connection), result.claims, null)
  return { result, outcome, state }
}

/* ── 1. sign in with no Kleym password ─────────────────────────────────── */

async function oidcSignIn(): Promise<void> {
  console.log('\n1. A user in an OIDC-connected organisation signs in with no Kleym password')
  const t = await tenant([{ group: 'treasury-approvers', role: 'APPROVER' }, { group: 'treasury-admins', role: 'OWNER' }])
  check('the client secret is stored encrypted and decrypts back', !t.connection.clientCiphertext.includes(CLIENT_SECRET) && decryptAtRest(t.connection.clientCiphertext) === CLIENT_SECRET)

  const { url } = await beginAuthorization(asOidc(t.connection), 'login')
  const u = new URL(url)
  check('the authorization URL carries PKCE S256, a state and a nonce', u.searchParams.get('code_challenge_method') === 'S256' && !!u.searchParams.get('state') && !!u.searchParams.get('nonce') && u.searchParams.get('client_id') === CLIENT_ID)

  const first = await signIn(t.connection, { sub: `okta-user-${RUN}`, email: `newperson-${RUN}@example.com`, email_verified: true, name: 'New Person', groups: ['treasury-approvers'] })
  check('the callback verifies the ID token and resolves claims', first.result.ok && first.result.claims.subject === `okta-user-${RUN}`, JSON.stringify(first.result))
  check('a new user is provisioned with the mapped role', first.outcome?.kind === 'ok' && first.outcome.provisioned, JSON.stringify(first.outcome))
  if (first.outcome?.kind !== 'ok') throw new Error('not provisioned')
  const userId = first.outcome.userId
  const membership = await prisma.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: t.orgId, userId } }, select: { role: true } })
  check('role APPROVER from the treasury-approvers group', membership.role === 'APPROVER', membership.role)
  const identity = await prisma.ssoIdentity.findUnique({ where: { connectionId_subject: { connectionId: t.connection.id, subject: `okta-user-${RUN}` } }, select: { userId: true } })
  check('the identity links on the subject', identity?.userId === userId)
  const { token } = await createSession(userId, {})
  const session = await resolveSessionByToken(token)
  check('a normal Kleym session results — opaque token, no IdP material', session?.user.id === userId && !idp.issued.some((t) => token.includes(t)))
  const tokenReq = idp.tokenRequests.at(-1)!
  check('the token exchange sent the code, the verifier and the secret to the IdP only', tokenReq.get('grant_type') === 'authorization_code' && !!tokenReq.get('code_verifier') && tokenReq.get('client_secret') === CLIENT_SECRET)

  const again = await signIn(t.connection, { sub: `okta-user-${RUN}`, email: `newperson-${RUN}@example.com`, email_verified: true, groups: ['treasury-admins'] })
  check('the same subject signs in to the same user', again.outcome?.kind === 'ok' && again.outcome.userId === userId && !again.outcome.provisioned)
  const after = await prisma.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: t.orgId, userId } }, select: { role: true } })
  check('a group change is reflected on the next sign-in: now OWNER', after.role === 'OWNER', after.role)
  const none = await signIn(t.connection, { sub: `okta-user-${RUN}`, groups: [] })
  check('no mapped group: the default role', none.outcome?.kind === 'ok' && (await prisma.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: t.orgId, userId } } })).role === 'VIEWER')

  // Bad tokens.
  const replay = await completeAuthorization(async () => asOidc(t.connection), { code: 'x', state: first.state })
  check('a state is single-use: the earlier flow cannot be replayed', !replay.ok && replay.reason === 'no-flow')
  const wrongAud = await signIn(t.connection, { sub: `okta-user-${RUN}-9`, aud: 'someone-else' })
  check('an ID token for another audience is refused', !wrongAud.result.ok && wrongAud.result.reason === 'invalid-token')
  const wrongIss = await signIn(t.connection, { sub: `okta-user-${RUN}-9`, iss: 'https://evil.example' })
  check('an ID token from another issuer is refused', !wrongIss.result.ok)
  check('roleFor picks the highest mapped role', roleFor(['a', 'b'], { defaultRole: 'VIEWER', mappings: [{ group: 'a', role: 'OPERATOR' }, { group: 'b', role: 'OWNER' }] }) === 'OWNER')
}

/* ── 1c. the discovery document is tenant-controlled input ─────────────── */

async function discoveryIsChecked(): Promise<void> {
  console.log('\n1c. The discovery document is checked: issuer agreement, and every endpoint through the outbound-URL rule')
  const t = await tenant()
  const owner = t.owner
  const org = t.org
  forgetDiscovery(idp.issuer)
  const prod = await discover(idp.issuer, fetch, 'production').catch((e: Error) => e)
  check('under the production rule, a loopback provider is refused outright (endpoint-refused)', prod instanceof DiscoveryError && prod.reason === 'endpoint-refused', String(prod))
  idp.docMode = 'loopback-token-endpoint'
  forgetDiscovery(idp.issuer)
  const loop = await discover(idp.issuer, fetch, 'production').catch((e: Error) => e)
  check('a document naming a loopback token_endpoint is refused under the production rule', loop instanceof DiscoveryError && loop.reason === 'endpoint-refused', String(loop))
  idp.docMode = 'claims-other-issuer'
  forgetDiscovery(idp.issuer)
  const other = await discover(idp.issuer).catch((e: Error) => e)
  check('a document claiming another issuer is refused (issuer-mismatch)', other instanceof DiscoveryError && other.reason === 'issuer-mismatch', String(other))
  const saveBad = await upsertConnection(owner.id, org, { handle: t.handle, issuer: idp.issuer, clientId: CLIENT_ID, scopes: 'openid profile email', subjectClaim: 'sub', groupsClaim: 'groups', ssoOnly: false, defaultRole: 'VIEWER', mappings: [] }, null)
  check('saving a connection whose document misbehaves is refused at save time', saveBad.kind === 'discovery-refused', JSON.stringify(saveBad))
  const flow = await signIn(t.connection, { sub: `x-${RUN}`, groups: [] })
  check('and a sign-in against it is refused at the start of the flow too (the document can change after saving)', !flow.result.ok && flow.result.reason === 'discovery:issuer-mismatch', JSON.stringify(flow.result))
  // And at the callback: a document that turns bad BETWEEN start and callback.
  idp.docMode = 'ok'
  forgetDiscovery(idp.issuer)
  idp.claims = { sub: `mid-${RUN}`, groups: [] }
  const { url: midUrl } = await beginAuthorization(asOidc(t.connection), 'login')
  const mid = authorize(midUrl)
  idp.docMode = 'claims-other-issuer'
  forgetDiscovery(idp.issuer)
  const midResult = await completeAuthorization(async () => asOidc(t.connection), mid, fetch)
  check('a document that turns bad between start and callback is refused at the callback', !midResult.ok && midResult.reason === 'exchange-failed', JSON.stringify(midResult))
  idp.docMode = 'ok'
  forgetDiscovery(idp.issuer)
  idp.docMode = 'ok'
  forgetDiscovery(idp.issuer)
  const goodSave = await upsertConnection(owner.id, org, { handle: t.handle, issuer: idp.issuer, clientId: CLIENT_ID, scopes: 'openid profile email', subjectClaim: 'sub', groupsClaim: 'groups', ssoOnly: false, defaultRole: 'VIEWER', mappings: [] }, null)
  check('a well-behaved document saves', goodSave.kind === 'ok')
  const withCreds = await upsertConnection(owner.id, org, { handle: t.handle, issuer: 'https://user:pw@idp.example.com', clientId: CLIENT_ID, scopes: 'openid profile email', subjectClaim: 'sub', groupsClaim: 'groups', ssoOnly: false, defaultRole: 'VIEWER', mappings: [] }, null).catch((e: Error) => e)
  check('an issuer with credentials never reaches discovery', withCreds instanceof Error || (withCreds as { kind: string }).kind === 'discovery-refused')

  // userinfo whose sub is not the ID token's is ignored.
  idp.userinfoSub = 'somebody-else'
  const conn = (await connectionForOrg(t.orgId))!
  await prisma.ssoConnection.update({ where: { id: conn.id }, data: { groupsClaim: 'userinfoGroups' } })
  const mismatch = await signIn((await connectionForOrg(t.orgId))!, { sub: `ui-${RUN}`, groups: [] })
  check('userinfo with a different sub is ignored: no groups merged from it', mismatch.result.ok && mismatch.result.claims.groups.length === 0, JSON.stringify(mismatch.result.ok ? mismatch.result.claims.groups : mismatch.result))
  idp.userinfoSub = null
  const match = await signIn((await connectionForOrg(t.orgId))!, { sub: `ui-${RUN}`, groups: [] })
  check('userinfo with the matching sub is merged', match.result.ok && match.result.claims.groups.join(',') === 'from-userinfo')
  await prisma.ssoConnection.update({ where: { id: conn.id }, data: { groupsClaim: 'groups' } })
}

/* ── 2. SSO only ───────────────────────────────────────────────────────── */

async function ssoOnly(): Promise<void> {
  console.log('\n2. "SSO only" refuses password sign-in at the API')
  const t = await tenant([], true)
  check('ssoOnlyFor reads the member\'s organisation', await ssoOnlyFor(t.owner.id))
  const login = (password: string) => loginRoute.POST(new Request('http://kleym.test/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 200)}` }, body: JSON.stringify({ username: t.owner.username, password }) }))
  const right = await login('correct horse')
  const wrong = await login('wrong')
  const rightBody = await right.text()
  const wrongBody = await wrong.text()
  check('the right password is refused with 403 sso-required', right.status === 403 && rightBody.includes('sso-required'), `${right.status} ${rightBody.slice(0, 80)}`)
  check('the wrong password is refused identically — no password oracle', wrong.status === 403 && wrongBody.replace(/"correlationId":"[^"]+"/, '') === rightBody.replace(/"correlationId":"[^"]+"/, ''))
  check('no session was created', (await prisma.session.count({ where: { userId: t.owner.id } })) === 0)
  const open = await tenant([], false)
  const ok = await loginRoute.POST(new Request('http://kleym.test/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify({ username: open.owner.username, password: 'wrong' }) })).catch((e: Error) => e)
  check('with SSO only off, a wrong password is the ordinary 401', ok instanceof Response && ok.status === 401, ok instanceof Response ? `${ok.status}` : String(ok))
}

/* ── 3. SCIM ───────────────────────────────────────────────────────────── */

async function scim(): Promise<void> {
  console.log('\n3. SCIM: provision, group → role, deprovision in one request')
  const t = await tenant([{ group: 'Treasury Approvers', role: 'APPROVER' }])
  const { token } = await issueScimToken(t.owner.id, t.orgId, 'okta', null)
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/scim+json' }
  const params = (id: string) => ({ params: Promise.resolve({ id }) })
  const call = (fn: (r: Request, p?: never) => Promise<Response>, method: string, path: string, body?: unknown) =>
    fn(new Request(`http://kleym.test/api/scim/v2${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }))

  const unauth = await usersRoute.GET(new Request('http://kleym.test/api/scim/v2/Users', { headers: { authorization: 'Bearer scim_00000000_' + 'x'.repeat(43) } }))
  check('a wrong token is 401 in the SCIM error schema', unauth.status === 401 && (await unauth.text()).includes('api:messages:2.0:Error'))

  const created = await call(usersRoute.POST, 'POST', '/Users', { schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: `Dana-${RUN}@Example.com`, externalId: `okta-dana-${RUN}`, active: true })
  const dana = (await created.json()) as { id: string; userName: string; active: boolean; externalId: string }
  check('POST /Users creates a member (201) with the externalId as the identity subject', created.status === 201 && dana.userName === `dana-${RUN}@example.com` && dana.active && dana.externalId === `okta-dana-${RUN}`, JSON.stringify(dana))
  check('provisioned at the default role', (await prisma.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: t.orgId, userId: dana.id } } })).role === 'VIEWER')
  const dup = await call(usersRoute.POST, 'POST', '/Users', { userName: `dana-${RUN}@example.com` })
  check('the same userName again is 409 uniqueness', dup.status === 409)
  const listed = await usersRoute.GET(new Request(`http://kleym.test/api/scim/v2/Users?filter=${encodeURIComponent(`userName eq "dana-${RUN}@example.com"`)}`, { headers }))
  const list = (await listed.json()) as { totalResults: number; Resources: { id: string }[] }
  check('GET /Users?filter=userName eq finds her', list.totalResults === 1 && list.Resources[0]!.id === dana.id)

  // The identity SCIM created is the one OIDC signs in with: same subject.
  const login = await signIn(t.connection, { sub: `okta-dana-${RUN}`, email: `dana-${RUN}@example.com`, email_verified: true, groups: [] })
  check('OIDC with sub = the SCIM externalId signs in as the provisioned user, no new account', login.outcome?.kind === 'ok' && login.outcome.userId === dana.id && !login.outcome.provisioned, JSON.stringify(login.outcome))

  // Groups drive the role.
  const g = await call(groupsRoute.POST, 'POST', '/Groups', { displayName: 'Treasury Approvers', members: [{ value: dana.id }] })
  const group = (await g.json()) as { id: string; members: { value: string }[] }
  check('POST /Groups with a member', g.status === 201 && group.members[0]?.value === dana.id)
  check('the mapped group made her APPROVER in the same request', (await prisma.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: t.orgId, userId: dana.id } } })).role === 'APPROVER')
  const removed = await groupRoute.PATCH(new Request(`http://kleym.test/api/scim/v2/Groups/${group.id}`, { method: 'PATCH', headers, body: JSON.stringify({ schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'remove', path: `members[value eq "${dana.id}"]` }] }) }), params(group.id))
  check('PATCH remove member', removed.status === 200)
  check('and the role falls back to the default on that sync', (await prisma.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: t.orgId, userId: dana.id } } })).role === 'VIEWER')
  const added = await groupRoute.PATCH(new Request(`http://kleym.test/api/scim/v2/Groups/${group.id}`, { method: 'PATCH', headers, body: JSON.stringify({ Operations: [{ op: 'add', path: 'members', value: [{ value: dana.id }] }] }) }), params(group.id))
  check('PATCH add member restores APPROVER', added.status === 200 && (await prisma.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: t.orgId, userId: dana.id } } })).role === 'APPROVER')

  // Deprovisioning: three live sessions, one request.
  await Promise.all([createSession(dana.id, {}), createSession(dana.id, {}), createSession(dana.id, {})])
  const { token: live } = await createSession(dana.id, {})
  check('four live sessions before', (await prisma.session.count({ where: { userId: dana.id } })) === 4)
  const deactivated = await userRoute.PATCH(new Request(`http://kleym.test/api/scim/v2/Users/${dana.id}`, { method: 'PATCH', headers, body: JSON.stringify({ schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'replace', value: { active: false } }] }) }), params(dana.id))
  const body = (await deactivated.json()) as { active: boolean }
  check('PATCH active:false answers 200 with active false', deactivated.status === 200 && body.active === false)
  check('the membership is gone', (await prisma.membership.count({ where: { organizationId: t.orgId, userId: dana.id } })) === 0)
  check('every live session is revoked — the one we hold resolves to nothing', (await prisma.session.count({ where: { userId: dana.id } })) === 0 && (await resolveSessionByToken(live)) === null)
  check('the account is deactivated (this was its only organisation)', (await prisma.user.findUniqueOrThrow({ where: { id: dana.id } })).isActive === false)
  const audit = await prisma.auditLog.findFirst({ where: { action: 'scim.user_deactivated', entityId: dana.id } })
  check('audited with the sessions ended', (audit?.metadata as Record<string, unknown>)?.sessionsEnded === 4, JSON.stringify(audit?.metadata))
  const after = await signIn(t.connection, { sub: `okta-dana-${RUN}`, groups: [] })
  check('OIDC sign-in for the deactivated identity is refused', after.outcome?.kind === 'inactive')

  const re = await userRoute.PATCH(new Request(`http://kleym.test/api/scim/v2/Users/${dana.id}`, { method: 'PATCH', headers, body: JSON.stringify({ Operations: [{ op: 'Replace', path: 'active', value: true }] }) }), params(dana.id))
  check('reactivation restores the membership at the group-mapped role', re.status === 200 && (await prisma.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: t.orgId, userId: dana.id } } })).role === 'APPROVER')
  const del = await userRoute.DELETE(new Request(`http://kleym.test/api/scim/v2/Users/${dana.id}`, { method: 'DELETE', headers }), params(dana.id))
  check('DELETE deprovisions the same way (204)', del.status === 204 && (await prisma.membership.count({ where: { organizationId: t.orgId, userId: dana.id } })) === 0)

  // Another organisation's token sees none of this.
  const other = await tenant()
  const { token: otherToken } = await issueScimToken(other.owner.id, other.orgId, 'x', null)
  const foreign = await userRoute.GET(new Request(`http://kleym.test/api/scim/v2/Users/${dana.id}`, { headers: { authorization: `Bearer ${otherToken}` } }), params(dana.id))
  check('a user is not visible through another organisation\'s token', foreign.status === 404)
}

/* ── 4. no linking on email ────────────────────────────────────────────── */

async function emailCollision(): Promise<void> {
  console.log('\n4. Sign-in never links an IdP identity to an existing account on email alone')
  const t = await tenant()
  const local = await prisma.user.create({ data: { username: `alice-${RUN}@example.com`, passwordHash: await hashPassword('pw'), role: 'SENDER' }, select: { id: true } })
  const usersBefore = await prisma.user.count()
  for (const verified of [false, true]) {
    const attempt = await signIn(t.connection, { sub: `attacker-${verified}`, email: `alice-${RUN}@example.com`, email_verified: verified, groups: ['treasury-admins'] })
    check(`an unknown subject asserting alice-${RUN}@example.com (email_verified=${verified}) is refused with link-required`, attempt.outcome?.kind === 'link-required', JSON.stringify(attempt.outcome))
  }
  check('no identity was created for the local account', (await prisma.ssoIdentity.count({ where: { userId: local.id } })) === 0)
  check('no new user was provisioned either', (await prisma.user.count()) === usersBefore)
  check('no membership was granted', (await prisma.membership.count({ where: { userId: local.id, organizationId: t.orgId } })) === 0)
  check('the refusal is audited', (await prisma.auditLog.count({ where: { action: 'sso.link_refused', entityId: local.id } })) === 2)

  // The explicit link, from the signed-in local account.
  idp.claims = { sub: `alice-real-${RUN}`, email: `alice-${RUN}@example.com`, email_verified: true, groups: [] }
  const { url } = await beginAuthorization(asOidc(t.connection), 'link', local.id)
  const { code, state } = authorize(url)
  const result = await completeAuthorization(async () => asOidc(t.connection), { code, state })
  check('a link flow carries the signed-in user through the state', result.ok && result.flow.purpose === 'link' && result.flow.userId === local.id)
  if (!result.ok) return
  const linked = await linkIdentity(local.id, asRoleSource(t.connection), result.claims, null)
  check('linkIdentity binds the subject to the local account', linked.kind === 'ok' && (await prisma.ssoIdentity.count({ where: { userId: local.id, subject: `alice-real-${RUN}` } })) === 1)
  const now = await signIn(t.connection, { sub: `alice-real-${RUN}`, email: `alice-${RUN}@example.com`, email_verified: true, groups: [] })
  check('and from then on that subject signs in as her', now.outcome?.kind === 'ok' && now.outcome.userId === local.id)
  const stolen = await signIn(t.connection, { sub: 'attacker-true', email: `alice-${RUN}@example.com`, email_verified: true, groups: [] })
  check('another subject with her email is still refused', stolen.outcome?.kind === 'link-required')
}

/* ── 5. no IdP token anywhere ──────────────────────────────────────────── */

async function noTokensLeak(): Promise<void> {
  console.log('\n5. No IdP access, refresh or ID token, and no client secret, in a cookie, a row or a log line')
  const all = stdoutLines.join('\n')
  check('no issued ID or access token appears in any log line', idp.issued.every((t) => !all.includes(t)), `${idp.issued.length} tokens issued`)
  check('the client secret appears in no log line', !all.includes(CLIENT_SECRET))
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM (
       SELECT "tokenHash" AS t FROM "Session"
       UNION ALL SELECT subject FROM "SsoIdentity"
       UNION ALL SELECT metadata::text FROM "AuditLog"
       UNION ALL SELECT "clientCiphertext" FROM "SsoConnection"
     ) x WHERE t LIKE 'at-%' OR t LIKE 'rt-%' OR t LIKE 'eyJ%' OR t LIKE '%' || $1 || '%'`, CLIENT_SECRET)
  check('no session, identity, audit or connection row holds a token or the secret', rows[0]!.n === 0n, `${rows[0]!.n}`)
  const before = stdoutLines.length
  logger.info({ id_token: 'eyJplanted', access_token: 'at-planted', refresh_token: 'rt-planted', client_secret: 'cs-planted', clientSecret: 'cs2-planted', nested: { access_token: 'at-nested' } }, 'sso: planted for the redaction test')
  const planted = stdoutLines.slice(before).join('')
  check('planted tokens and secrets are redacted by the logger at any depth', planted.includes('[redacted]') && !/eyJplanted|at-planted|rt-planted|cs-planted|cs2-planted|at-nested/.test(planted), planted.slice(0, 200))
}

async function main(): Promise<void> {
  try {
    await oidcSignIn()
    await discoveryIsChecked()
    await ssoOnly()
    await scim()
    await emailCollision()
    await noTokensLeak()
  } finally {
    await prisma.$disconnect()
    const { redis } = await import('../src/lib/redis/client')
    await redis.quit().catch(() => undefined)
    server.close()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
