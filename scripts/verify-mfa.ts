/**
 * Verification for MFA (#47). Real Postgres and Redis; a synthetic WebAuthn
 * authenticator (P-256, attestation "none") so passkey registration and
 * assertion are exercised end to end through the same server functions the
 * routes call.
 *
 * What is proven: a user enrols TOTP and a passkey and a session unlocks
 * with either; an organisation policy holds a member without a factor at
 * enrolment, server-side, from the moment it is set; batch signing, reclaim
 * and key issuance are gated on a factor fresher than five minutes whatever
 * the session's age; the TOTP key sits encrypted and appears in no log line
 * even when planted in one; a recovery code works once and its use is
 * audited at warn; TOTP guesses are bounded by the recipient OTP's semantics
 * — counted before the comparison, five then locked.
 *
 * Run: pnpm verify:mfa
 */
import { createHash, createSign, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()

const stdoutLines: string[] = []
const realWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
  stdoutLines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
  return (realWrite as (c: string | Uint8Array, ...r: unknown[]) => boolean)(chunk, ...rest)
}) as typeof process.stdout.write

const { prisma } = await import('../src/lib/db/client')
const { logger } = await import('../src/lib/config/logger')
const { env } = await import('../src/lib/config/env')
const { createSession, resolveSessionByToken } = await import('../src/lib/auth/session')
const { beginTotpEnrolment, confirmTotpEnrolment, checkCode, checkTotp, factorsOf, hasFactor, MFA_MAX_ATTEMPTS } = await import('../src/lib/auth/mfa/factors')
const { totpAt, totpMatches, base32Decode, base32Encode } = await import('../src/lib/auth/mfa/totp')
const { decryptSecret } = await import('../src/lib/auth/mfa/crypto')
const { passkeyRegistrationOptions, passkeyRegister, passkeyAuthenticationOptions, passkeyAuthenticate, relyingParty } = await import('../src/lib/auth/mfa/passkeys')
const { markMfaVerified, markStepUp, stepUpGate, stepUpState, STEP_UP_MAX_AGE_SECONDS } = await import('../src/lib/auth/mfa/step-up')
const { mfaRequiredFor } = await import('../src/lib/auth/mfa/policy')
const { setMfaPolicy } = await import('../src/lib/api/organizations')

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/* ── fixtures ──────────────────────────────────────────────────────────── */

async function user(tag = 'mfa') {
  const row = await prisma.user.create({ data: { username: `${tag}-${randomUUID().slice(0, 8)}`, passwordHash: 'x', role: 'SENDER' }, select: { id: true, username: true } })
  const orgId = await personalOrg(prisma, row.id)
  return { ...row, orgId }
}
async function session(userId: string) {
  const { token } = await createSession(userId, {})
  const resolved = await resolveSessionByToken(token)
  return { token, id: resolved!.user.sessionId }
}
const state = async (token: string) => (await resolveSessionByToken(token))?.state ?? 'none'

/* ── a synthetic authenticator ─────────────────────────────────────────── */

const b64url = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url')
// Minimal CBOR: what an attestation object needs.
function cbor(value: unknown): Buffer {
  const head = (major: number, n: number): Buffer => {
    if (n < 24) return Buffer.from([(major << 5) | n])
    if (n < 256) return Buffer.from([(major << 5) | 24, n])
    if (n < 65536) return Buffer.from([(major << 5) | 25, n >> 8, n & 255])
    return Buffer.from([(major << 5) | 26, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
  }
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value)
  if (typeof value === 'string') return Buffer.concat([head(3, Buffer.byteLength(value)), Buffer.from(value)])
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value])
  if (value instanceof Map) {
    const parts: Buffer[] = [head(5, value.size)]
    for (const [k, v] of value) parts.push(cbor(k), cbor(v))
    return Buffer.concat(parts)
  }
  throw new Error('unsupported')
}

function authenticator() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string }
  const credId = randomBytes(16)
  const { rpID, origin } = relyingParty()
  const rpIdHash = createHash('sha256').update(rpID).digest()
  let counter = 0
  const cose = new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]])
  return {
    credId,
    register(challenge: string) {
      const flags = Buffer.from([0x41]) // UP | AT
      const authData = Buffer.concat([rpIdHash, flags, Buffer.alloc(4), Buffer.alloc(16), Buffer.from([credId.length >> 8, credId.length & 255]), credId, cbor(cose)])
      const attestationObject = cbor(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin, crossOrigin: false }))
      return { id: b64url(credId), rawId: b64url(credId), type: 'public-key', response: { clientDataJSON: b64url(clientDataJSON), attestationObject: b64url(attestationObject), transports: ['internal'] }, clientExtensionResults: {}, authenticatorAttachment: 'platform' }
    },
    assert(challenge: string) {
      counter += 1
      const c = Buffer.alloc(4)
      c.writeUInt32BE(counter)
      const authData = Buffer.concat([rpIdHash, Buffer.from([0x01]), c])
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }))
      const signature = createSign('sha256').update(Buffer.concat([authData, createHash('sha256').update(clientDataJSON).digest()])).sign(privateKey)
      return { id: b64url(credId), rawId: b64url(credId), type: 'public-key', response: { authenticatorData: b64url(authData), clientDataJSON: b64url(clientDataJSON), signature: b64url(signature) }, clientExtensionResults: {}, authenticatorAttachment: 'platform' }
    },
  }
}

/* ── 1. enrol TOTP and a passkey; sign in with either ──────────────────── */

async function enrolAndSignIn(): Promise<{ userId: string; keyBase32: string; recovery: string[]; auth: ReturnType<typeof authenticator> }> {
  console.log('\n1. A user enrols TOTP and a passkey, and a session unlocks with either')
  const u = await user()
  const s0 = await session(u.id)
  check('with no factor and no policy the session is simply ok', (await state(s0.token)) === 'ok')

  const begun = await beginTotpEnrolment(u.id, u.username)
  if (begun.kind !== 'ok') throw new Error('enrolment did not begin')
  check('an unconfirmed enrolment is not a factor yet', !(await hasFactor(u.id)) && (await state(s0.token)) === 'ok')
  const wrong = await confirmTotpEnrolment(u.id, '000000', null)
  check('a wrong confirmation code is refused and counted', wrong.kind === 'wrong' && wrong.attemptsLeft === MFA_MAX_ATTEMPTS - 1, JSON.stringify(wrong))
  const confirmed = await confirmTotpEnrolment(u.id, totpAt(begun.keyBase32), null)
  check('the right code confirms and hands back eight recovery codes once', confirmed.kind === 'ok' && confirmed.recoveryCodes.length === 8 && confirmed.recoveryCodes.every((c) => /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(c)), JSON.stringify(confirmed))
  if (confirmed.kind !== 'ok') throw new Error('not confirmed')
  check('the factor now exists', await hasFactor(u.id))

  // A NEW session owes the factor; nothing else is reachable with it.
  const s1 = await session(u.id)
  check('a fresh session after enrolment is mfa-pending', (await state(s1.token)) === 'mfa-pending')
  const code = await checkCode(u.id, totpAt(begun.keyBase32), null)
  check('the app code verifies', code.ok && code.via === 'totp', JSON.stringify(code))
  await markMfaVerified(u.id, s1.id, 'totp', null)
  check('and the session is ok', (await state(s1.token)) === 'ok')

  // A passkey.
  const auth = authenticator()
  const s2 = await session(u.id)
  const regOptions = await passkeyRegistrationOptions({ id: u.id, username: u.username }, s2.id)
  const registered = await passkeyRegister({ id: u.id }, s2.id, auth.register(regOptions.challenge) as never, 'synthetic', null)
  check('a passkey registers against the challenge issued to this session', registered.ok, JSON.stringify(registered))
  const replayReg = await passkeyRegister({ id: u.id }, s2.id, auth.register(regOptions.challenge) as never, 'again', null)
  check('the same challenge cannot register twice', !replayReg.ok)
  const factors = await factorsOf(u.id)
  check('factors: totp confirmed, one passkey, eight recovery codes', factors.totp !== null && factors.passkeys.length === 1 && factors.recoveryCodesLeft === 8)

  const s3 = await session(u.id)
  check('another fresh session is pending', (await state(s3.token)) === 'mfa-pending')
  const authOptions = await passkeyAuthenticationOptions(u.id, s3.id)
  const asserted = await passkeyAuthenticate(u.id, s3.id, auth.assert(authOptions.challenge) as never)
  check('the passkey assertion verifies', asserted.ok, JSON.stringify(asserted))
  await markMfaVerified(u.id, s3.id, 'passkey', null)
  check('and unlocks the session', (await state(s3.token)) === 'ok')
  const stale = await passkeyAuthenticate(u.id, s3.id, auth.assert(authOptions.challenge) as never)
  check('a second assertion against a consumed challenge is refused', !stale.ok)
  const other = await user('other')
  const s4 = await session(other.id)
  const opts4 = await passkeyAuthenticationOptions(other.id, s4.id)
  const crossed = await passkeyAuthenticate(other.id, s4.id, auth.assert(opts4.challenge) as never)
  check('a credential from another account is unknown to this one', !crossed.ok && crossed.reason === 'unknown credential')
  const row = await prisma.mfaPasskey.findFirstOrThrow({ where: { userId: u.id }, select: { counter: true, lastUsedAt: true } })
  check('the signature counter and last-used advanced', Number(row.counter) === 1 && row.lastUsedAt !== null, `counter=${row.counter}`)

  return { userId: u.id, keyBase32: begun.keyBase32, recovery: confirmed.recoveryCodes, auth }
}

/* ── 2. policy ─────────────────────────────────────────────────────────── */

async function policyHoldsSignIn(): Promise<void> {
  console.log('\n2. An organisation policy holds a member without a factor at enrolment, server-side')
  const owner = await user('owner')
  const viewer = await user('viewer')
  await prisma.membership.create({ data: { userId: viewer.id, organizationId: owner.orgId, role: 'VIEWER' } })
  const org = { id: owner.orgId, name: 'p', role: 'OWNER' as const, approvalThreshold: null, approvalsRequired: 1, screeningUrl: null, mfaPolicy: 'OFF' as const }
  const so = await session(owner.id)
  const sv = await session(viewer.id)
  check('before any policy, both sessions are ok', (await state(so.token)) === 'ok' && (await state(sv.token)) === 'ok')

  await setMfaPolicy(owner.id, org, 'APPROVERS', null)
  check('APPROVERS: the owner (no factor) is now enrol-required on the SAME session', (await state(so.token)) === 'enrol-required')
  check('the viewer is not reached by APPROVERS', (await state(sv.token)) === 'ok')
  check('mfaRequiredFor agrees', (await mfaRequiredFor(owner.id)) && !(await mfaRequiredFor(viewer.id)))

  await setMfaPolicy(owner.id, { ...org, mfaPolicy: 'APPROVERS' }, 'ALL', null)
  check('ALL: the viewer is enrol-required too', (await state(sv.token)) === 'enrol-required')
  check('the policy change is audited', (await prisma.auditLog.count({ where: { action: 'org.mfa_policy', organizationId: owner.orgId } })) === 2)

  // Enrolling satisfies it — and the new factor makes the session pending until presented.
  const begun = await beginTotpEnrolment(owner.id, owner.username)
  if (begun.kind !== 'ok') throw new Error('no enrolment')
  await confirmTotpEnrolment(owner.id, totpAt(begun.keyBase32), null)
  check('after enrolling, the owner\'s session owes the factor (pending), no longer enrolment', (await state(so.token)) === 'mfa-pending')
  await markMfaVerified(owner.id, so.id, 'totp', null)
  check('and is ok once presented', (await state(so.token)) === 'ok')
  await setMfaPolicy(owner.id, { ...org, mfaPolicy: 'ALL' }, 'OFF', null)
  check('switching the policy off releases the viewer', (await state(sv.token)) === 'ok')
  check('but the enrolled owner still owes the factor on a new session — a factor, once enrolled, is always asked', (await state((await session(owner.id)).token)) === 'mfa-pending')
}

/* ── 3. step-up ────────────────────────────────────────────────────────── */

async function stepUp(ctx: { userId: string; keyBase32: string }): Promise<void> {
  console.log('\n3. Batch signing, reclaim and key issuance require a factor fresher than five minutes, whatever the session\'s age')
  const s = await session(ctx.userId)
  const signedInAt = new Date(Date.now() - 6 * 3600_000)
  // A session that signed in six hours ago, with the factor presented then.
  await prisma.session.update({ where: { id: s.id }, data: { mfaAt: signedInAt, stepUpAt: signedInAt } })
  check('the six-hour-old session is ok', (await state(s.token)) === 'ok')
  check('but its step-up is REQUIRED', (await stepUpGate(ctx.userId, s.id)) === 'required')
  check('stepUpState says required', (await stepUpState(ctx.userId, s.id)) === 'required')
  await markStepUp(ctx.userId, s.id, 'totp', null)
  check('after presenting a factor it is fresh', (await stepUpGate(ctx.userId, s.id)) === null)
  const later = new Date(Date.now() + (STEP_UP_MAX_AGE_SECONDS + 1) * 1000)
  check(`and required again ${STEP_UP_MAX_AGE_SECONDS + 1} s later`, (await stepUpGate(ctx.userId, s.id, later)) === 'required')
  const nobody = await user('nofactor')
  const sn = await session(nobody.id)
  check('a user with no factor is not asked (nothing to present)', (await stepUpState(nobody.id, sn.id)) === 'not-enrolled' && (await stepUpGate(nobody.id, sn.id)) === null)
  check('a step-up is audited', (await prisma.auditLog.count({ where: { action: 'mfa.step_up', entityId: s.id } })) === 1)

  // The routes that move money call the gate. Static, because the gate reads the cookie jar.
  const { readFileSync } = await import('node:fs')
  const gated = [
    'src/app/api/campaigns/[id]/batches/prepare/route.ts',
    'src/app/api/campaigns/[id]/batches/submit/route.ts',
    'src/app/api/campaigns/[id]/reclaim/prepare/route.ts',
    'src/app/api/campaigns/[id]/reclaim/submit/route.ts',
    'src/app/api/settings/api-keys/route.ts',
  ]
  for (const file of gated) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    check(`${file.replace('src/app/api', '')} calls requireStepUp after requireUser`, src.includes('requireStepUp(user)') && src.indexOf('requireStepUp(user)') > src.indexOf('requireUser('))
  }
}

/* ── 4. the key at rest and in the log ─────────────────────────────────── */

async function keyNeverInClear(ctx: { userId: string; keyBase32: string }): Promise<void> {
  console.log('\n4. The TOTP key sits encrypted and reaches no log line')
  const row = await prisma.mfaTotp.findUniqueOrThrow({ where: { userId: ctx.userId }, select: { ciphertext: true } })
  check('the column holds ciphertext, not the key', !row.ciphertext.includes(ctx.keyBase32) && decryptSecret(row.ciphertext) === ctx.keyBase32)
  const scan = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "MfaTotp" WHERE ciphertext LIKE '%' || $1 || '%'`, ctx.keyBase32)
  check('no MfaTotp row contains the key', scan[0]!.n === 0n)
  check('base32 round-trips', base32Encode(base32Decode(ctx.keyBase32)) === ctx.keyBase32)

  // Planted in a log call, under the names a careless call site would use.
  const before = stdoutLines.length
  logger.info({ totpSecret: ctx.keyBase32, totpKey: ctx.keyBase32, code: '123456', recoveryCode: 'abcd-efgh-ijkl', recoveryCodes: ['abcd-efgh-ijkl'], MFA_ENCRYPTION_KEY: env.MFA_ENCRYPTION_KEY, nested: { totpSecret: ctx.keyBase32, code: '654321' } }, 'mfa: planted for the redaction test')
  const planted = stdoutLines.slice(before).join('')
  check('the planted key, code and recovery code are redacted at the top level and nested', planted.includes('[redacted]') && !planted.includes(ctx.keyBase32) && !planted.includes('123456') && !planted.includes('654321') && !planted.includes('abcd-efgh-ijkl'), planted.slice(0, 200))
  check('the encryption key is redacted by SECRET_ENV_KEYS', !planted.includes(env.MFA_ENCRYPTION_KEY))
  check('no line written so far by this run carries the key', !stdoutLines.some((l) => l.includes(ctx.keyBase32)))
}

/* ── 5. recovery codes ─────────────────────────────────────────────────── */

async function recoveryCodes(ctx: { userId: string; recovery: string[] }): Promise<void> {
  console.log('\n5. A recovery code works once and its use is audited at warn')
  const before = stdoutLines.length
  const first = await checkCode(ctx.userId, ctx.recovery[0]!, null)
  check('a recovery code verifies', first.ok && first.via === 'recovery', JSON.stringify(first))
  const again = await checkCode(ctx.userId, ctx.recovery[0]!, null)
  check('the same code does not work twice', !again.ok && again.reason === 'wrong')
  const audit = await prisma.auditLog.findFirst({ where: { action: 'mfa.recovery_code_used', userId: ctx.userId }, orderBy: { createdAt: 'desc' } })
  check('its use wrote an audit row marked warn with the codes left', (audit?.metadata as Record<string, unknown>)?.severity === 'warn' && (audit?.metadata as Record<string, unknown>)?.recoveryCodesLeft === 7, JSON.stringify(audit?.metadata))
  const warned = stdoutLines.slice(before).some((l) => l.includes('"level":40') && l.includes('recovery code used'))
  check('and a warn log line', warned)
  check('the code itself is in neither', !JSON.stringify(audit).includes(ctx.recovery[0]!) && !stdoutLines.slice(before).some((l) => l.includes(ctx.recovery[0]!)))
  check('seven remain', (await factorsOf(ctx.userId)).recoveryCodesLeft === 7)
  // Uppercase and stray whitespace are the user's, not the code's.
  const second = await checkCode(ctx.userId, `  ${ctx.recovery[1]!.toUpperCase()} `, null)
  check('a code typed in capitals with whitespace still works', second.ok)
}

/* ── 6. brute force ────────────────────────────────────────────────────── */

async function bruteForce(): Promise<void> {
  console.log('\n6. TOTP guesses are bounded like the recipient OTP: counted first, five then locked')
  const u = await user('brute')
  const begun = await beginTotpEnrolment(u.id, u.username)
  if (begun.kind !== 'ok') throw new Error('no enrolment')
  await confirmTotpEnrolment(u.id, totpAt(begun.keyBase32), null)
  const results: string[] = []
  for (let i = 0; i < MFA_MAX_ATTEMPTS; i += 1) {
    const r = await checkTotp(u.id, '000000')
    results.push(r.ok ? 'ok' : `${r.reason}:${r.attemptsLeft}`)
  }
  check('four wrong guesses count down, the fifth locks', results.join(',') === 'wrong:4,wrong:3,wrong:2,wrong:1,locked:0', results.join(','))
  const right = await checkTotp(u.id, totpAt(begun.keyBase32))
  check('the RIGHT code is refused while locked — lockout is checked before the comparison', !right.ok && right.reason === 'locked')
  const rec = await checkCode(u.id, 'aaaa-bbbb-cccc', null)
  check('a recovery code is refused while locked too', !rec.ok && rec.reason === 'locked')
  const row = await prisma.mfaTotp.findUniqueOrThrow({ where: { userId: u.id }, select: { attempts: true, lockedUntil: true } })
  check('the counter reached five and a lockout is recorded', row.attempts === 5 && row.lockedUntil !== null && row.lockedUntil.getTime() > Date.now())
  const later = new Date(row.lockedUntil!.getTime() + 1000)
  const afterLock = await checkTotp(u.id, totpAt(begun.keyBase32, later), later)
  check('after the lockout the right code works and the counter resets', afterLock.ok && (await prisma.mfaTotp.findUniqueOrThrow({ where: { userId: u.id } })).attempts === 0)
  const skew = totpMatches(begun.keyBase32, totpAt(begun.keyBase32, new Date(Date.now() - 30_000)))
  const tooFar = totpMatches(begun.keyBase32, totpAt(begun.keyBase32, new Date(Date.now() - 90_000)))
  check('one step of clock skew is accepted; three are not', skew !== null && tooFar === null)
  check('a locked factor is logged at warn', stdoutLines.some((l) => l.includes('"level":40') && l.includes('totp locked')))
}

async function main(): Promise<void> {
  try {
    const ctx = await enrolAndSignIn()
    await policyHoldsSignIn()
    await stepUp(ctx)
    await keyNeverInClear(ctx)
    await recoveryCodes(ctx)
    await bruteForce()
  } finally {
    await prisma.$disconnect()
    const { redis } = await import('../src/lib/redis/client')
    await redis.quit().catch(() => undefined)
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
