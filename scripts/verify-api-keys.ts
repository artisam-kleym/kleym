/**
 * Verification for the public API acceptance criteria on #16. Real Postgres
 * and real Redis — the rate limiter and the key store are the things under test.
 *
 * Every check here fails by returning 200: a revoked key that still works, a
 * key that reads another account's campaigns, a limiter that counts per user
 * instead of per key. None is visible to typecheck, lint or a unit test.
 *
 * Run: pnpm verify:api-keys
 */
import { randomUUID } from 'node:crypto'
import { applyEnvPlaceholders } from '../tests/env-placeholders'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { redis } = await import('../src/lib/redis/client')
const { issueApiKey, resolveApiKey, revokeApiKey, listApiKeys, touchApiKey } = await import(
  '../src/lib/auth/api-key'
)
const { requireApiCaller, API_RATE_LIMIT } = await import('../src/lib/api/v1')

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const bearer = (key: string) =>
  new Request('https://kleym.test/api/v1/campaigns', { headers: { authorization: `Bearer ${key}` } })

async function makeUser(tag: string): Promise<string> {
  const user = await prisma.user.create({
    data: { username: `${tag}-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' },
    select: { id: true },
  })
  return user.id
}

async function keysAuthenticateAndRevoke(): Promise<void> {
  console.log('\n1. A live key authenticates; a revoked one stops working immediately')

  const userId = await makeUser('keyholder')
  const issued = await issueApiKey(userId, 'ci')

  const resolved = await resolveApiKey(bearer(issued.key))
  check('the key resolves to its owner', resolved.ok && resolved.caller.userId === userId, JSON.stringify(resolved))

  await revokeApiKey(issued.id, userId)
  const afterRevoke = await resolveApiKey(bearer(issued.key))
  check('a revoked key no longer resolves', !afterRevoke.ok)

  // No cache, no TTL: revocation has to bite on the very next request.
  const response = (await requireApiCaller(bearer(issued.key))).response
  check('and the endpoint answers 401', response?.status === 401, String(response?.status))

  const wrong = await resolveApiKey(bearer(`${issued.key}x`))
  check('a tampered key does not resolve', !wrong.ok)

  const garbage = await resolveApiKey(bearer('not-a-key'))
  check('garbage does not resolve', !garbage.ok)

  const none = await resolveApiKey(new Request('https://kleym.test/api/v1/campaigns'))
  check('a missing header does not resolve', !none.ok)

  /*
   * EVERY key must resolve, not most of them.
   *
   * The secret half is base64url, whose alphabet contains `_`. An earlier
   * parse split the key on `_` and expected three parts, so any key whose
   * random half happened to contain one was rejected as malformed — about half
   * of them, and correct the rest of the time, which is how a bug like that
   * survives a spot check. One key proves nothing; a batch does.
   */
  const batch = await Promise.all(
    Array.from({ length: 25 }, (_, i) => issueApiKey(userId, `batch-${i}`)),
  )
  const resolvedAll = await Promise.all(batch.map((k) => resolveApiKey(bearer(k.key))))
  const bad = resolvedAll.filter((r) => !r.ok).length
  check('25 freshly issued keys all resolve', bad === 0, `${bad} of 25 failed`)
  check(
    'and at least one of them contains the character that used to break parsing',
    batch.some((k) => k.key.split('_').length > 3),
    'no underscore appeared in 25 secrets — rerun',
  )
}

async function theKeyIsShownOnce(): Promise<void> {
  console.log('\n2. The full key is never retrievable after issue')

  const userId = await makeUser('once')
  const issued = await issueApiKey(userId, 'reporting')

  const listed = await listApiKeys(userId)
  const row = listed.find((k) => k.id === issued.id)!
  const serialised = JSON.stringify(listed)

  check('the list carries the prefix', row.prefix === issued.prefix)
  check('the list does not carry the key', !serialised.includes(issued.key))
  check('the list does not carry the hash', !('keyHash' in row))

  // The stored value must not be the key, nor derivable from it by inspection.
  const stored = await prisma.apiKey.findUniqueOrThrow({
    where: { id: issued.id },
    select: { keyHash: true },
  })
  check('the stored value is an argon2id hash', stored.keyHash.startsWith('$argon2id$'), stored.keyHash.slice(0, 12))
  check('the stored value is not the key', !stored.keyHash.includes(issued.key))

  // The secret half must not be recoverable from anything that IS stored.
  const secret = issued.key.split('_')[2]!
  const everything = JSON.stringify(await prisma.apiKey.findMany({ where: { userId } }))
  check('no column contains the secret half', !everything.includes(secret))
}

async function lastUsedIsRecorded(): Promise<void> {
  console.log('\n3. lastUsedAt updates on a successful request')

  const userId = await makeUser('tracked')
  const issued = await issueApiKey(userId, 'tracked')

  const before = await prisma.apiKey.findUniqueOrThrow({ where: { id: issued.id }, select: { lastUsedAt: true } })
  check('a new key has never been used', before.lastUsedAt === null)

  const auth = await requireApiCaller(bearer(issued.key))
  check('the request is authorised', auth.caller !== undefined)

  const after = await prisma.apiKey.findUniqueOrThrow({ where: { id: issued.id }, select: { lastUsedAt: true } })
  check('lastUsedAt is set', after.lastUsedAt !== null)

  // A revoked key must not have its use recorded — it had none.
  await revokeApiKey(issued.id, userId)
  const stamp = (await prisma.apiKey.findUniqueOrThrow({ where: { id: issued.id }, select: { lastUsedAt: true } })).lastUsedAt
  await touchApiKey(issued.id)
  const unchanged = (await prisma.apiKey.findUniqueOrThrow({ where: { id: issued.id }, select: { lastUsedAt: true } })).lastUsedAt
  check('a revoked key does not record use', unchanged?.getTime() === stamp?.getTime())
}

async function theLimitIsPerKey(): Promise<void> {
  console.log(`\n4. ${API_RATE_LIMIT.limit} requests per minute, counted per KEY`)

  const userId = await makeUser('busy')
  const first = await issueApiKey(userId, 'first')
  const second = await issueApiKey(userId, 'second')

  let allowed = 0
  let limited = 0
  for (let i = 0; i < API_RATE_LIMIT.limit + 1; i += 1) {
    const result = await requireApiCaller(bearer(first.key))
    if (result.caller) allowed += 1
    else if (result.response.status === 429) limited += 1
  }

  check(`the first ${API_RATE_LIMIT.limit} are allowed`, allowed === API_RATE_LIMIT.limit, `${allowed}`)
  check('the next one is limited', limited === 1, `${limited}`)

  /*
   * The second key belongs to the SAME user. Counting per user would exhaust
   * it too — and a caller who revokes a leaked key would find their remaining
   * keys already spent.
   */
  const other = await requireApiCaller(bearer(second.key))
  check('a second key on the same account is unaffected', other.caller !== undefined, String(other.response?.status))

  const headers = other.headers!
  check('the response advertises the limit', headers['x-ratelimit-limit'] === String(API_RATE_LIMIT.limit))
  check('and what is left', Number(headers['x-ratelimit-remaining']) === API_RATE_LIMIT.limit - 1, headers['x-ratelimit-remaining'])
}

async function keysCannotCrossAccounts(): Promise<void> {
  console.log("\n5. One account's key cannot read another's data")

  const alice = await makeUser('alice')
  const bob = await makeUser('bob')
  const aliceKey = await issueApiKey(alice, 'alice')

  const campaign = await prisma.campaign.create({
    data: {
      userId: bob,
      name: "bob's campaign",
      network: 'testnet',
      senderPublicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB',
      assetCode: 'XLM',
      amountPerLink: '1.0000000',
      linkCount: 1,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
    select: { id: true },
  })

  const resolved = await resolveApiKey(bearer(aliceKey.key))
  const callerId = resolved.ok ? resolved.caller.userId : ''
  check("alice's key resolves to alice", callerId === alice)

  // The query the route runs. Ownership is IN it, so a foreign id is simply
  // absent rather than found-then-refused.
  const { owned } = await import('../src/lib/api/session-guard')
  const visible = await prisma.campaign.findFirst({ where: owned(campaign.id, callerId), select: { id: true } })
  check("bob's campaign is invisible to alice's key", visible === null)

  const links = await prisma.claimLink.findMany({ where: { campaignId: campaign.id, campaign: { userId: callerId } } })
  check("bob's links are invisible too", links.length === 0)

  const asBob = await prisma.campaign.findFirst({ where: owned(campaign.id, bob), select: { id: true } })
  check('and bob can still see his own', asBob !== null)
}

/**
 * Paging a public API must not drop or duplicate rows.
 *
 * `ClaimLink.createdAt` defaults to CURRENT_TIMESTAMP, which in Postgres is
 * TRANSACTION time — every link registered by one `createMany` shares a
 * timestamp to the millisecond. `ORDER BY "createdAt"` over 90 equal keys is
 * not a total order, and under LIMIT/OFFSET an unstable sort means a consumer
 * walking pages sees one link twice and never sees another.
 */
async function pagingIsStable(): Promise<void> {
  console.log('\n6. Walking pages returns every link exactly once')

  const userId = await makeUser('paging')
  const { Keypair } = await import('@stellar/stellar-sdk')
  const { registerLinks } = await import('../src/lib/api/links')

  const campaign = await prisma.campaign.create({
    data: {
      userId,
      name: 'paging',
      network: 'testnet',
      senderPublicKey: Keypair.random().publicKey(),
      assetCode: 'XLM',
      amountPerLink: '1.0000000',
      linkCount: 90,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
    select: { id: true },
  })
  const registered = await registerLinks(
    campaign.id,
    userId,
    Array.from({ length: 90 }, () => Keypair.random().publicKey()),
  )
  if (registered.kind !== 'ok') throw new Error(`fixture registration failed: ${registered.kind}`)

  const stamps = await prisma.$queryRawUnsafe<{ createdAt: Date }[]>(
    'SELECT "createdAt" FROM "ClaimLink" WHERE "campaignId" = $1',
    campaign.id,
  )
  const distinct = new Set(stamps.map((r) => r.createdAt.toISOString()))
  check(
    'the premise holds — links registered together share a timestamp',
    distinct.size < stamps.length,
    `${distinct.size} distinct across ${stamps.length}`,
  )

  /*
   * The walk writes between pages, modelling ordinary concurrent activity on
   * the campaign — a batch confirming, a claim landing. That is what changes
   * the sort's input. With a completely idle table the unstable order may hold
   * by luck, which is the point: it is luck, not a guarantee.
   */
  const walk = async (stable: boolean, disturb = true) => {
    const seen: string[] = []
    for (let page = 1; page <= 9; page += 1) {
      const rows = await prisma.claimLink.findMany({
        where: { campaignId: campaign.id },
        orderBy: stable ? [{ createdAt: 'asc' }, { id: 'asc' }] : { createdAt: 'asc' },
        take: 10,
        skip: (page - 1) * 10,
        select: { id: true },
      })
      seen.push(...rows.map((r) => r.id))
      if (disturb) {
        await prisma.claimLink.updateMany({
          where: { campaignId: campaign.id, id: { in: rows.map((r) => r.id) } },
          data: { label: 'walked'.repeat(200) },
        })
      }
    }
    return seen
  }

  const naive = await walk(false)
  const naiveUnique = new Set(naive)
  console.log(
    `        (unstable walk: ${naive.length} rows returned, ${naiveUnique.size} distinct — ` +
      `${90 - naiveUnique.size} link(s) never seen)`,
  )
  check(
    'createdAt alone does NOT survive the walk — the reason this check exists',
    naiveUnique.size !== 90,
    `saw ${naive.length} rows, ${naiveUnique.size} distinct — no duplication observed this run`,
  )

  const stable = await walk(true)
  check('the tie-broken order returns 90 rows', stable.length === 90, `${stable.length}`)
  check('all distinct', new Set(stable).size === 90, `${new Set(stable).size}`)

  const undisturbed = await walk(true, false)
  check('and again with nothing else touching the table', new Set(undisturbed).size === 90)
}

async function main(): Promise<void> {
  try {
    await keysAuthenticateAndRevoke()
    await theKeyIsShownOnce()
    await lastUsedIsRecorded()
    await theLimitIsPerKey()
    await keysCannotCrossAccounts()
    await pagingIsStable()
  } finally {
    await prisma.$disconnect()
    redis.disconnect()
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
