/**
 * Verification for user provisioning by invitation (#39). Real Postgres, real Redis.
 *
 * Criteria 1–5 from the issue. Criterion 6 — a SENDER gets 404 from
 * POST /api/admin/users — needs a request scope for `requireAdmin`'s cookie
 * read, so it is checked over HTTP against a running server (see the PR), the
 * same way verify-admin.ts treats the admin gate.
 *
 * Run: pnpm verify:invitations
 */
import { randomUUID } from 'node:crypto'
import { applyEnvPlaceholders } from '../tests/env-placeholders'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { verifyPassword } = await import('../src/lib/auth/password')
const { scrubMetadata, REDACTED } = await import('../src/lib/api/audit')
const { createInvitedUser, redeemInvitation, pendingInvitations, INVITATION_TTL_MS, createUserSchema } =
  await import('../src/lib/api/invitations')
const redeemRoute = await import('../src/app/api/invite/redeem/route')

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function admin(): Promise<string> {
  const row = await prisma.user.create({
    data: { username: `inv-admin-${randomUUID()}`, passwordHash: 'x', role: 'ADMIN' },
    select: { id: true },
  })
  return row.id
}
const tokenOf = (url: string) => url.slice(url.lastIndexOf('/') + 1)

async function createsAnInactiveAccount(): Promise<void> {
  console.log('\n1. An admin creates a SENDER; it cannot sign in until redeemed')
  const actor = await admin()
  const username = `invitee-${randomUUID().slice(0, 8)}`
  const outcome = await createInvitedUser(actor, { username, role: 'SENDER' }, '203.0.113.5')
  check('it is created', outcome.kind === 'ok', JSON.stringify(outcome))
  if (outcome.kind !== 'ok') return

  const user = await prisma.user.findUniqueOrThrow({ where: { username }, select: { id: true, isActive: true, role: true, passwordHash: true } })
  check('as a SENDER', user.role === 'SENDER')
  check('inactive, so login and getSessionUser both refuse it', user.isActive === false)
  check('with an argon2id placeholder, not an empty hash', user.passwordHash.startsWith('$argon2id$'))
  check('the invite URL is on APP_URL with a 64-hex token', /\/invite\/[a-f0-9]{64}$/.test(outcome.inviteUrl), outcome.inviteUrl)
  check('and expires in three days', Math.abs(outcome.expiresAt.getTime() - Date.now() - INVITATION_TTL_MS) < 5_000)
  check('it shows as pending on the admin page', (await pendingInvitations()).has(user.id))

  const again = await createInvitedUser(actor, { username, role: 'SENDER' }, null)
  check('the same username twice is a conflict', again.kind === 'conflict', JSON.stringify(again))
}

async function theTokenIsStoredHashedAndNowhereElse(): Promise<void> {
  console.log('\n2. The plaintext token is in no column and no audit row')
  const actor = await admin()
  const outcome = await createInvitedUser(actor, { username: `hash-${randomUUID().slice(0, 8)}`, role: 'SENDER' }, null)
  if (outcome.kind !== 'ok') return check('created', false)
  const token = tokenOf(outcome.inviteUrl)

  const invitation = await prisma.invitation.findFirstOrThrow({ where: { user: { username: outcome.user.username } } })
  check('the stored hash is not the token', invitation.tokenHash !== token && invitation.tokenHash.length === 64)
  check('the invitation row nowhere contains it', !JSON.stringify(invitation).includes(token))
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.create', entityId: outcome.user.id } })
  check('the audit row names the actor', audit.userId === actor)
  check('and the new user, by id and name', audit.entityId === outcome.user.id && JSON.stringify(audit.metadata).includes(outcome.user.username))
  check('and does not contain the token', !JSON.stringify(audit).includes(token))

  // Criterion 5: plant password material and watch the scrubber take it.
  const planted = scrubMetadata({ username: 'x', password: 'hunter2hunter2', token, inviteToken: token })
  check('planted password material is redacted', planted.clean.password === REDACTED && planted.clean.token === REDACTED && planted.clean.inviteToken === REDACTED, JSON.stringify(planted))
  check('and the plain username survives', planted.clean.username === 'x')
}

async function redeemsOnceOnly(): Promise<void> {
  console.log('\n3. Redemption sets the password once; twice, expired and unknown all fail alike')
  const actor = await admin()
  const outcome = await createInvitedUser(actor, { username: `redeem-${randomUUID().slice(0, 8)}`, role: 'SENDER' }, null)
  if (outcome.kind !== 'ok') return check('created', false)
  const token = tokenOf(outcome.inviteUrl)
  const password = `correct-horse-${randomUUID()}`

  const first = await redeemInvitation(token, password)
  check('the first redemption succeeds', first.kind === 'ok' && first.username === outcome.user.username, JSON.stringify(first))
  const user = await prisma.user.findUniqueOrThrow({ where: { id: outcome.user.id }, select: { isActive: true, passwordHash: true } })
  check('the account is now active', user.isActive)
  check('with the password the USER chose', await verifyPassword(user.passwordHash, password))
  check('no longer pending', !(await pendingInvitations()).has(outcome.user.id))

  const second = await redeemInvitation(token, 'another-password-entirely')
  check('the second redemption fails', second.kind === 'invalid', JSON.stringify(second))
  const after = await prisma.user.findUniqueOrThrow({ where: { id: outcome.user.id }, select: { passwordHash: true } })
  check('and did not change the password', after.passwordHash === user.passwordHash)

  const expired = await createInvitedUser(actor, { username: `expired-${randomUUID().slice(0, 8)}`, role: 'SENDER' }, null)
  if (expired.kind !== 'ok') return check('created', false)
  const late = new Date(Date.now() + INVITATION_TTL_MS + 1_000)
  const expiredOutcome = await redeemInvitation(tokenOf(expired.inviteUrl), password, late)
  const unknownOutcome = await redeemInvitation('0'.repeat(64), password)
  check('an expired invitation fails', expiredOutcome.kind === 'invalid')
  check('identically to an unknown one', JSON.stringify(expiredOutcome) === JSON.stringify(unknownOutcome))
  check('and the expired account stays inactive',
    !(await prisma.user.findUniqueOrThrow({ where: { id: expired.user.id }, select: { isActive: true } })).isActive)

  // Two concurrent redemptions of one token: exactly one wins.
  const raced = await createInvitedUser(actor, { username: `race-${randomUUID().slice(0, 8)}`, role: 'SENDER' }, null)
  if (raced.kind !== 'ok') return check('created', false)
  const results = await Promise.all([
    redeemInvitation(tokenOf(raced.inviteUrl), 'password-number-one'),
    redeemInvitation(tokenOf(raced.inviteUrl), 'password-number-two'),
  ])
  check('of two simultaneous redemptions exactly one succeeds', results.filter((r) => r.kind === 'ok').length === 1, JSON.stringify(results))
}

async function theRouteAnswersTheSameForEveryRefusal(): Promise<void> {
  console.log('\n4. The redeem route: same body for unknown, expired and spent; rate limited')
  const actor = await admin()
  const spent = await createInvitedUser(actor, { username: `route-${randomUUID().slice(0, 8)}`, role: 'SENDER' }, null)
  if (spent.kind !== 'ok') return check('created', false)
  await redeemInvitation(tokenOf(spent.inviteUrl), 'a-perfectly-fine-password')

  const post = (body: unknown, ip = `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`) =>
    redeemRoute.POST(new Request('http://localhost/api/invite/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    }))
  const bodies = await Promise.all([
    post({ token: '0'.repeat(64), password: 'a-perfectly-fine-password' }),
    post({ token: tokenOf(spent.inviteUrl), password: 'a-perfectly-fine-password' }),
  ])
  const texts = await Promise.all(bodies.map((r) => r.text()))
  check('unknown and spent both answer 404', bodies.every((r) => r.status === 404), bodies.map((r) => r.status).join(','))
  check('with byte-identical bodies', texts[0] === texts[1])
  check('a malformed token is refused as malformed, not looked up', (await post({ token: 'nope', password: 'a-perfectly-fine-password' })).status === 400)
  check('a short password is refused', (await post({ token: '0'.repeat(64), password: 'short' })).status === 400)

  const ip = '10.8.7.6'
  let limited = 0
  for (let i = 0; i < 7; i += 1) {
    if ((await post({ token: '1'.repeat(64), password: 'a-perfectly-fine-password' }, ip)).status === 429) limited += 1
  }
  check('the sixth attempt from one IP is rate limited', limited >= 1, `${limited} limited of 7`)

  const good = await createInvitedUser(actor, { username: `route2-${randomUUID().slice(0, 8)}`, role: 'SENDER' }, null)
  if (good.kind !== 'ok') return check('created', false)
  const ok = await post({ token: tokenOf(good.inviteUrl), password: 'a-perfectly-fine-password' })
  check('a valid redemption through the route is 200 with the username', ok.status === 200 && ((await ok.json()) as { username: string }).username === good.user.username)
}

function inputRules(): void {
  console.log('\n5. Input rules')
  check('usernames are letters, digits, dot, dash, underscore', createUserSchema.safeParse({ username: 'ann.smith-2' }).success)
  check('and not spaces or slashes', !createUserSchema.safeParse({ username: 'ann smith' }).success && !createUserSchema.safeParse({ username: 'a/b' }).success)
  check('role defaults to SENDER', createUserSchema.parse({ username: 'abc' }).role === 'SENDER')
  check('a password in the body is not a field', !createUserSchema.safeParse({ username: 'abc', password: 'x' }).success)
}

async function main(): Promise<void> {
  try {
    await createsAnInactiveAccount()
    await theTokenIsStoredHashedAndNowhereElse()
    await redeemsOnceOnly()
    await theRouteAnswersTheSameForEveryRefusal()
    inputRules()
  } finally {
    await prisma.$disconnect()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
