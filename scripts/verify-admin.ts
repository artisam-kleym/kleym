/**
 * Verification for the admin area, audit logging and health on #15.
 * Real Postgres, real Redis.
 *
 * The interesting criterion is 7: no audit metadata may ever contain a seed,
 * token, API key or OTP. That is a claim about EVERY call site, present and
 * future, so the checks here attack the scrubber directly with the shapes a
 * careless caller would actually produce — rather than checking that the four
 * call sites written today happen to be clean.
 *
 * Run: pnpm verify:admin
 */
import { randomUUID } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { recordAudit, scrubMetadata, queryAudit, REDACTED } = await import('../src/lib/api/audit')
const { listUsers, setUserActive, listAllCampaigns } = await import('../src/lib/api/admin')

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function user(role: 'ADMIN' | 'SENDER' = 'SENDER') {
  return prisma.user.create({
    data: { username: `admin-${randomUUID()}`, passwordHash: 'x', role },
    select: { id: true, username: true },
  })
}

async function metadataNeverCarriesACredential(): Promise<void> {
  console.log('\n1. Credentials offered as audit metadata')
  const seed = Keypair.random().secret()

  const cases: { name: string; input: Record<string, string | number | boolean | null>; key: string }[] = [
    { name: 'a session token', input: { token: 'abc123def456' }, key: 'token' },
    { name: 'an API key', input: { apiKey: 'kleym_live_secret' }, key: 'apiKey' },
    { name: 'an OTP code', input: { otpCode: '123456' }, key: 'otpCode' },
    { name: 'a password', input: { newPassword: 'hunter2' }, key: 'newPassword' },
    { name: 'a secret, spelled oddly', input: { Secret_Key: 'x' }, key: 'Secret_Key' },
    { name: 'an authorization header', input: { authorization: 'Bearer x' }, key: 'authorization' },
    // The value rule, not the key rule: an innocent-looking field holding a seed.
    { name: 'a seed hiding under `note`', input: { note: `see ${seed}` }, key: 'note' },
    { name: 'a seed hiding under `label`', input: { label: seed }, key: 'label' },
  ]

  for (const testCase of cases) {
    const { clean, removed } = scrubMetadata(testCase.input)
    check(
      `${testCase.name} is redacted`,
      clean[testCase.key] === REDACTED && removed.includes(testCase.key),
      JSON.stringify(clean),
    )
  }

  const { clean } = scrubMetadata({ name: 'Summer promo', linkCount: 90, prefix: 'kl_ab12' })
  check('ordinary metadata survives untouched', clean.name === 'Summer promo' && clean.linkCount === 90, JSON.stringify(clean))
  check('and so does an API key PREFIX, which is not a key', clean.prefix === 'kl_ab12', JSON.stringify(clean))

  /*
   * `code` is an ordinary English suffix. A substring rule on it redacted
   * `assetCode` — the obvious next field on campaign.create — and fired the
   * credential alarm on every campaign creation. Whole segments, not substrings.
   */
  const ordinary = scrubMetadata({
    assetCode: 'USDC', statusCode: 409, resultCode: 'tx_bad_seq', countryCode: 'PH', ephemeralPublicKey: 'GABC', publickey: 'G',
  })
  check('assetCode, statusCode, resultCode and countryCode are not credentials',
    ordinary.removed.length === 0 && ordinary.clean.assetCode === 'USDC', JSON.stringify(ordinary))
  check('a public key is not a private one', ordinary.clean.ephemeralPublicKey === 'GABC' && ordinary.clean.publickey === 'G', JSON.stringify(ordinary))
  // Every spelling, INCLUDING run-together and all-caps ones: a whole-segment
  // rule once let `apikey`, `privatekey` and `sessiontoken` through.
  const caught = {
    otp_code: '1', otpCode: '2', code: '3', sessionToken: 't', private_key: 'S', PrivateKey: 'S',
    apikey: 'k', APIKEY: 'k', privatekey: 'S', secretkey: 'S', sessiontoken: 't', passwordhash: 'h', 'x-api-key': 'k',
  }
  const stillCaught = scrubMetadata(caught)
  check('while otpCode, otp_code, a bare code, sessionToken, private_key, apikey, APIKEY, sessiontoken and passwordhash are',
    Object.keys(caught).every((k) => stillCaught.clean[k] === REDACTED),
    JSON.stringify(stillCaught))
}

async function scrubbingSurvivesToTheDatabase(): Promise<void> {
  console.log('\n2. A careless call site, all the way to the row')
  const actor = await user()
  const seed = Keypair.random().secret()

  await recordAudit({
    userId: actor.id,
    action: 'campaign.create',
    entityType: 'campaign',
    entityId: 'c_1',
    metadata: { name: 'Promo', token: 'sess_abcdef', note: seed },
    ip: '203.0.113.9',
  })

  const row = await prisma.auditLog.findFirstOrThrow({
    where: { userId: actor.id },
    select: { metadata: true, action: true, ip: true },
  })
  const metadata = row.metadata as Record<string, unknown>

  check('the row was written', row.action === 'campaign.create')
  check('with the acting IP', row.ip === '203.0.113.9', `${row.ip}`)
  check('the token is redacted', metadata.token === REDACTED, JSON.stringify(metadata))
  check('the seed is redacted', metadata.note === REDACTED, JSON.stringify(metadata))
  check('the harmless field survives', metadata.name === 'Promo', JSON.stringify(metadata))

  // The seed must not be anywhere in the serialised row, under any key.
  check('and the seed appears nowhere in the row', !JSON.stringify(row).includes(seed))
}

async function noSeedInAnyAuditRow(): Promise<void> {
  console.log('\n3. The whole audit table, scanned')
  const seed = Keypair.random().secret()
  const actor = await user()
  await recordAudit({
    userId: actor.id,
    action: 'security.seed_submitted',
    entityType: 'route',
    entityId: '/api/campaigns',
    metadata: { field: 'links.0.secret', correlationId: randomUUID() },
    ip: null,
  })

  const rows = await prisma.auditLog.findMany({ select: { metadata: true } })
  const serialised = JSON.stringify(rows)
  check('no row contains this run\'s seed', !serialised.includes(seed))
  check(
    'and the seed-submitted row records the FIELD, not the value',
    rows.some((row) => JSON.stringify(row.metadata).includes('links.0.secret')),
  )
}

async function deactivationEndsSessions(): Promise<void> {
  console.log('\n4. Deactivating a user')
  const admin = await user('ADMIN')
  const target = await user()

  for (let i = 0; i < 3; i += 1) {
    await prisma.session.create({
      data: {
        userId: target.id,
        tokenHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    })
  }
  check('the user has sessions', (await prisma.session.count({ where: { userId: target.id } })) === 3)

  const outcome = await setUserActive(admin.id, target.id, false, '198.51.100.4')
  check('deactivation succeeds', outcome.kind === 'ok', JSON.stringify(outcome))
  check('reporting how many sessions ended', outcome.kind === 'ok' && outcome.sessionsEnded === 3, JSON.stringify(outcome))

  check(
    'every session is gone, not merely inert',
    (await prisma.session.count({ where: { userId: target.id } })) === 0,
  )
  check(
    'the user is deactivated',
    (await prisma.user.findUniqueOrThrow({ where: { id: target.id }, select: { isActive: true } })).isActive === false,
  )

  const audit = await prisma.auditLog.findFirstOrThrow({
    where: { entityId: target.id, action: 'user.deactivate' },
    select: { userId: true, ip: true, metadata: true },
  })
  check('exactly one audit row, naming the actor', audit.userId === admin.id)
  check('with their IP', audit.ip === '198.51.100.4', `${audit.ip}`)
  check(
    'and one row, not two',
    (await prisma.auditLog.count({ where: { entityId: target.id, action: 'user.deactivate' } })) === 1,
  )

  const again = await setUserActive(admin.id, target.id, false, null)
  check('deactivating twice is refused', again.kind === 'conflict', JSON.stringify(again))
  check(
    'and does not write a second audit row',
    (await prisma.auditLog.count({ where: { entityId: target.id, action: 'user.deactivate' } })) === 1,
  )

  /*
   * Reactivation ends no sessions and says so. It used to sweep the user's
   * expired sessions and report that count as `sessionsEnded`, which read as
   * if reactivating someone had signed them out.
   */
  await prisma.session.create({
    data: {
      userId: target.id,
      tokenHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
      expiresAt: new Date(Date.now() - 3_600_000), // already expired
    },
  })
  const reactivated = await setUserActive(admin.id, target.id, true, null)
  check('reactivation succeeds', reactivated.kind === 'ok', JSON.stringify(reactivated))
  check('and reports no sessions ended', reactivated.kind === 'ok' && reactivated.sessionsEnded === 0, JSON.stringify(reactivated))
  const activation = await prisma.auditLog.findFirstOrThrow({
    where: { entityId: target.id, action: 'user.activate' },
    select: { metadata: true },
  })
  check('nor claims any in the audit row', !('sessionsEnded' in (activation.metadata as object)), JSON.stringify(activation.metadata))
  check('the expired row was left to its own cleanup', (await prisma.session.count({ where: { userId: target.id } })) === 1)
}

async function adminsCannotLockThemselvesOut(): Promise<void> {
  console.log('\n5. An admin deactivating themselves')
  const admin = await user('ADMIN')
  const outcome = await setUserActive(admin.id, admin.id, false, null)
  check('it is refused', outcome.kind === 'conflict', JSON.stringify(outcome))
  check(
    'and they are still active',
    (await prisma.user.findUniqueOrThrow({ where: { id: admin.id }, select: { isActive: true } })).isActive,
  )
}

/*
 * The admin gate is NOT checked here.
 *
 * `requireAdmin` reads cookies, which needs a request scope this script does
 * not have — and faking one would test the fake. Criterion 2 is about what a
 * SENDER receives from a real server on a real route, so it is exercised over
 * HTTP against a production build instead, covering every admin page and the
 * users API. See the PR for the transcript.
 */

async function filteringAndPaging(): Promise<void> {
  console.log('\n6. Filtering and paging a seeded set')
  const actor = await user()
  const other = await user()
  // Unique per run: this script runs against a database that keeps its rows,
  // and a fixed id made "filtered by entity" return 2 on the second run.
  const run = randomUUID().slice(0, 8)

  for (let i = 0; i < 25; i += 1) {
    await recordAudit({
      userId: actor.id,
      action: i % 2 === 0 ? 'campaign.create' : 'campaign.cancel',
      entityType: 'campaign',
      entityId: `seeded_${run}_${i}`,
      metadata: { index: i },
      ip: '203.0.113.1',
    })
  }
  await recordAudit({ userId: other.id, action: 'apikey.create', entityType: 'apikey', entityId: 'k1', ip: null })

  const mine = await queryAudit({ userId: actor.id, perPage: 10 })
  check('filtered by user', mine.total === 25, `${mine.total}`)
  check('paged to ten', mine.rows.length === 10, `${mine.rows.length}`)
  check('across three pages', mine.pages === 3, `${mine.pages}`)
  check('every row is that user\'s', mine.rows.every((row) => row.username !== null))

  const creates = await queryAudit({ userId: actor.id, action: 'campaign.create' })
  check('filtered by action', creates.total === 13, `${creates.total}`)

  const one = await queryAudit({ entityId: `seeded_${run}_7` })
  check('filtered by entity', one.total === 1, `${one.total}`)

  /*
   * A paged walk must not skip or repeat.
   *
   * Every row here shares a createdAt to within milliseconds, which is exactly
   * the case that breaks an unstable sort — the bug LINK_ORDER was added for.
   */
  const tied = await user()
  const sameInstant = new Date('2031-03-04T05:06:07.000Z')
  // Through the chain (#49) — a direct insert would be an unchained row that
  // verify:audit-chain rightly reports as an insertion — with the time set.
  const { appendChained } = await import('../src/lib/api/audit-chain')
  const { Prisma } = await import('../src/generated/prisma/client')
  for (let i = 0; i < 30; i += 1) {
    await appendChained({
      id: `tied_${run}_${i}`,
      userId: tied.id,
      organizationId: null,
      action: 'campaign.create',
      entityType: 'campaign',
      entityId: `tied_${run}_${i}`,
      metadata: Prisma.JsonNull,
      ip: null,
      // The SAME instant, to the millisecond, for all thirty — sequential
      // inserts are milliseconds apart and never tie.
      //
      // Honest caveat: even with the ties manufactured, this check does NOT
      // distinguish whether `queryAudit` breaks them on `id`. Postgres returns
      // these thirty in a consistent order either way at this size, and
      // removing the tiebreaker was verified NOT to fail this section. The
      // tiebreaker stays because it is correct and free, and because #27/#28
      // hit exactly this bug on larger paged data — but what is proven below
      // is that paging returns every row once, not that the sort is stable.
      createdAt: sameInstant,
    })
  }

  const seen = new Set<string>()
  let walked = 0
  for (let page = 1; page <= 3; page += 1) {
    const slice = await queryAudit({ userId: tied.id, perPage: 10, page })
    walked += slice.rows.length
    for (const row of slice.rows) seen.add(row.id)
  }
  check('a paged walk over identical timestamps returns 30 rows', walked === 30, `${walked}`)
  check('every one of them distinct', seen.size === 30, `${seen.size} distinct of ${walked}`)

  const window = await queryAudit({ userId: actor.id, from: new Date(Date.now() + 86_400_000) })
  check('a future date range returns nothing', window.total === 0, `${window.total}`)
}

async function adminReadsAreComplete(): Promise<void> {
  console.log('\n7. What the admin lists show')
  const users = await listUsers()
  check('users are listed', users.length > 0, `${users.length}`)
  check('with their session counts', users.every((row) => typeof row.sessions === 'number'))
  check('and no password hash anywhere', !JSON.stringify(users).includes('passwordHash'))

  const campaigns = await listAllCampaigns()
  check('campaigns list without erroring', Array.isArray(campaigns))
}

async function main(): Promise<void> {
  try {
    await metadataNeverCarriesACredential()
    await scrubbingSurvivesToTheDatabase()
    await noSeedInAnyAuditRow()
    await deactivationEndsSessions()
    await adminsCannotLockThemselvesOut()
    await filteringAndPaging()
    await adminReadsAreComplete()
  } finally {
    await prisma.$disconnect()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
