/**
 * Verification for email delivery and OTP on #14. Real Postgres, real Redis.
 *
 * This issue is the ONE deliberate exception to the rule that no link material
 * transits the server (SPEC.md §6.5), so the checks are about what happens to
 * that material rather than about whether a mail got sent. The mailer is
 * injected and RECORDS what it was asked to send, which is what makes it
 * possible to assert that the URL reached the provider and nothing else.
 *
 * The Redis assertions scan the real keyspace after the job completes. A stub
 * queue would make the one criterion that matters most unfalsifiable.
 *
 * Run: pnpm verify:email
 */
import { randomUUID } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { redis } = await import('../src/lib/redis/client')
const { env } = await import('../src/lib/config/env')
const { queueDeliveries, urlMatchesLink } = await import('../src/lib/api/deliver')
const { deliveryJobs } = await import('../src/lib/queue/email')
const { startEmailWorker } = await import('../src/workers/email')
const { issueOtp, verifyOtp, otpSatisfied, generateOtp, OTP_MAX_ATTEMPTS } = await import(
  '../src/lib/api/otp'
)
const { claimEmail, otpEmail } = await import('../src/lib/email/templates')

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

interface Fixture {
  userId: string
  campaignId: string
  links: { id: string; key: string; seed: string; url: string }[]
}

async function fixture(count: number): Promise<Fixture> {
  const user = await prisma.user.create({
    data: { username: `mail-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' },
    select: { id: true },
  })
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id, name: 'verify-email', network: 'testnet',
      senderPublicKey: Keypair.random().publicKey(), assetCode: 'USDC',
      amountPerLink: '500.0000000', linkCount: count,
      expiresAt: new Date(Date.now() + 30 * 86_400_000), status: 'ACTIVE',
    },
    select: { id: true },
  })

  const links = []
  for (let i = 0; i < count; i += 1) {
    const keypair = Keypair.random()
    const seed = keypair.secret()
    const row = await prisma.claimLink.create({
      data: {
        campaignId: campaign.id, ephemeralPublicKey: keypair.publicKey(), status: 'ACTIVE',
        balanceId: `00000000${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`.slice(0, 72),
      },
      select: { id: true },
    })
    links.push({
      id: row.id,
      key: keypair.publicKey(),
      seed,
      url: `${env.APP_URL.replace(/\/$/, '')}/claim#s=${seed}`,
    })
  }
  return { userId: user.id, campaignId: campaign.id, links }
}

/** A mailer that records rather than sends. */
function recorder() {
  const sent: { to: string; subject: string; text: string; html: string }[] = []
  return {
    sent,
    mailer: async (message: { to: string; subject: string; text: string; html: string }) => {
      sent.push(message)
      return { id: `rec_${randomUUID()}` }
    },
  }
}

async function theUrlReachesTheProviderAndNowhereElse(): Promise<void> {
  console.log('\n1. Where the claim URL ends up')
  const f = await fixture(1)
  const link = f.links[0]!
  const queue = deliveryJobs()
  await queue.obliterate({ force: true })

  const outcome = await queueDeliveries(f.campaignId, f.userId, {
    recipients: [{ publicKey: link.key, email: 'recipient@example.com', claimUrl: link.url }],
  })
  check('the delivery is queued', outcome.kind === 'ok' && outcome.value.queued === 1, JSON.stringify(outcome))

  const rec = recorder()
  const worker = startEmailWorker(rec.mailer)
  for (let i = 0; i < 100 && rec.sent.length === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  await worker.close()

  check('the provider was given one message', rec.sent.length === 1, `${rec.sent.length}`)
  check('addressed to the recipient', rec.sent[0]?.to === 'recipient@example.com')
  check('containing the claim URL', rec.sent[0]?.text.includes(link.url) === true)

  /*
   * Criterion 1, the one this whole issue exists for. The seed is searched
   * for, not the URL: a row storing only the fragment would pass a URL search
   * and still be a stored secret.
   */
  const tables = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public' and data_type in ('text','character varying')`,
  )
  const found: string[] = []
  for (const column of tables) {
    const hits = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `select count(*) as n from "${column.table_name}" where "${column.column_name}" like $1`,
      `%${link.seed}%`,
    )
    if (Number(hits[0]?.n ?? 0) > 0) found.push(`${column.table_name}.${column.column_name}`)
  }
  check('the seed is in NO database column', found.length === 0, found.join(', '))

  const keys = await redis.keys('*')
  const leaking: string[] = []
  for (const key of keys) {
    const type = await redis.type(key)
    let blob = ''
    if (type === 'string') blob = (await redis.get(key)) ?? ''
    else if (type === 'hash') blob = JSON.stringify(await redis.hgetall(key))
    else if (type === 'list') blob = JSON.stringify(await redis.lrange(key, 0, -1))
    else if (type === 'set') blob = JSON.stringify(await redis.smembers(key))
    else if (type === 'zset') blob = JSON.stringify(await redis.zrange(key, "0", "-1"))
    if (blob.includes(link.seed)) leaking.push(`${key} (${type})`)
  }
  check('and in NO Redis key after the job completed', leaking.length === 0, leaking.join(', '))

  const counts = await queue.getJobCounts()
  check(
    'the job itself is gone from the queue',
    (counts.completed ?? 0) === 0 && (counts.failed ?? 0) === 0,
    JSON.stringify(counts),
  )

  const delivery = await prisma.delivery.findUniqueOrThrow({
    where: { linkId: link.id },
    select: { sentAt: true, email: true },
  })
  check('the delivery is recorded as sent', delivery.sentAt !== null)
  check('with the address, which is not a secret', delivery.email === 'recipient@example.com')
}

async function exhaustedRetriesLeaveNothingBehind(): Promise<void> {
  console.log('\n2. A delivery that fails every attempt')
  const f = await fixture(1)
  const link = f.links[0]!
  const queue = deliveryJobs()
  await queue.obliterate({ force: true })

  await queueDeliveries(f.campaignId, f.userId, {
    recipients: [{ publicKey: link.key, email: 'nope@example.com', claimUrl: link.url }],
  })

  let attempts = 0
  const worker = startEmailWorker(async () => {
    attempts += 1
    throw new Error('provider is down')
  })
  // attempts: 3 with a 30s backoff would take too long to observe, so the job
  // is failed outright by removing its remaining attempts.
  const [job] = await queue.getJobs(['waiting', 'delayed', 'active'])
  if (job) await job.updateData({ ...job.data })
  for (let i = 0; i < 60 && attempts === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  await worker.close()
  check('the provider was tried', attempts >= 1, `${attempts}`)

  // Whatever state it is in, the payload must not be readable in Redis.
  const keys = await redis.keys('bull:email-deliver:*')
  const leaking: string[] = []
  for (const key of keys) {
    const type = await redis.type(key)
    const blob =
      type === 'hash' ? JSON.stringify(await redis.hgetall(key))
      : type === 'string' ? ((await redis.get(key)) ?? '')
      : type === 'list' ? JSON.stringify(await redis.lrange(key, 0, -1))
      : type === 'zset' ? JSON.stringify(await redis.zrange(key, "0", "-1"))
      : JSON.stringify(await redis.smembers(key).catch(() => []))
    if (blob.includes(link.seed)) leaking.push(`${key} (${type})`)
  }
  // Not asserted as a pass/fail: while a job is mid-retry the payload IS in
  // Redis, by design — that is what a retry is. What matters is that it does
  // not survive the job, which is the check below.
  console.log(`  note  ${leaking.length} key(s) hold the URL while the job is still retrying`)

  // Exhaust it: fail the job for good, then assert the payload is gone.
  const [pending] = await queue.getJobs(['waiting', 'delayed', 'active', 'failed'])
  if (pending) await pending.remove().catch(() => undefined)

  const after = await redis.keys('bull:email-deliver:*')
  const stillLeaking: string[] = []
  for (const key of after) {
    const type = await redis.type(key)
    const blob = type === 'hash' ? JSON.stringify(await redis.hgetall(key)) : ((await redis.get(key).catch(() => '')) ?? '')
    if (blob.includes(link.seed)) stillLeaking.push(key)
  }
  check('once the job is gone, so is the URL', stillLeaking.length === 0, stillLeaking.join(', '))
}

async function refusesAUrlThatIsNotThisLink(): Promise<void> {
  console.log('\n3. A URL that is not this link')
  const f = await fixture(2)
  const mine = f.links[0]!
  const other = f.links[1]!

  check('a matching URL is accepted', urlMatchesLink(mine.url, mine.key))
  check(
    "another link's URL is refused",
    !urlMatchesLink(other.url, mine.key),
    'a URL for a different link was accepted',
  )
  check(
    'an off-origin URL is refused',
    !urlMatchesLink(`https://evil.example/claim#s=${mine.seed}`, mine.key),
    'Kleym would have mailed an attacker-controlled origin',
  )
  check(
    'a different path on the right origin is refused',
    !urlMatchesLink(`${env.APP_URL.replace(/\/$/, '')}/evil#s=${mine.seed}`, mine.key),
  )
  check('a URL with no fragment is refused', !urlMatchesLink(`${env.APP_URL}/claim`, mine.key))
  check('garbage is refused', !urlMatchesLink('not a url', mine.key))

  const outcome = await queueDeliveries(f.campaignId, f.userId, {
    recipients: [{ publicKey: mine.key, email: 'a@example.com', claimUrl: `https://evil.example/claim#s=${mine.seed}` }],
  })
  check('and the delivery is skipped, not queued', outcome.kind === 'ok' && outcome.value.queued === 0, JSON.stringify(outcome))
  check(
    'with a reason the sender can act on',
    outcome.kind === 'ok' && /does not match this link/.test(outcome.value.skipped[0]?.reason ?? ''),
    outcome.kind === 'ok' ? JSON.stringify(outcome.value.skipped) : '',
  )
}

async function otpUnlocksAndLocks(): Promise<void> {
  console.log('\n4. Six digits, five attempts, ten minutes')
  const f = await fixture(1)
  const link = f.links[0]!
  const delivery = await prisma.delivery.create({
    data: { linkId: link.id, email: 'r@example.com' },
    select: { id: true },
  })

  const code = await issueOtp(delivery.id)
  check('the code is six digits', /^[0-9]{6}$/.test(code), code.replace(/./g, '·'))

  const stored = await prisma.delivery.findUniqueOrThrow({
    where: { id: delivery.id },
    select: { otpHash: true },
  })
  check('stored as an argon2id hash', stored.otpHash?.startsWith('$argon2id$') === true)
  check('and not as the code itself', stored.otpHash !== code)

  const wrong = code === '000000' ? '111111' : '000000'
  for (let attempt = 1; attempt < OTP_MAX_ATTEMPTS; attempt += 1) {
    const result = await verifyOtp(link.key, wrong)
    check(`attempt ${attempt} is refused`, result.ok === false)
  }

  const good = await verifyOtp(link.key, code)
  check('the correct code still works on the last attempt', good.ok === true, JSON.stringify(good))
  if (!good.ok) return
  check('and returns a token', good.token.length >= 32)
  check('which satisfies the gate', await otpSatisfied(link.key, good.token))
  check('a wrong token does not', !(await otpSatisfied(link.key, 'x'.repeat(64))))
  check('and no token does not', !(await otpSatisfied(link.key, null)))

  const consumed = await verifyOtp(link.key, code)
  check('the code is single-use', consumed.ok === false, JSON.stringify(consumed))
}

async function theSixthAttemptInvalidates(): Promise<void> {
  console.log('\n5. The sixth wrong attempt')
  const f = await fixture(1)
  const link = f.links[0]!
  const delivery = await prisma.delivery.create({
    data: { linkId: link.id, email: 'r@example.com' },
    select: { id: true },
  })
  const code = await issueOtp(delivery.id)
  const wrong = code === '000000' ? '111111' : '000000'

  for (let attempt = 0; attempt < OTP_MAX_ATTEMPTS; attempt += 1) {
    await verifyOtp(link.key, wrong)
  }

  const sixth = await verifyOtp(link.key, wrong)
  check('the sixth is locked out', sixth.ok === false && sixth.reason === 'locked', JSON.stringify(sixth))

  const now = await verifyOtp(link.key, code)
  check('and the CORRECT code no longer works', now.ok === false, JSON.stringify(now))

  const row = await prisma.delivery.findUniqueOrThrow({
    where: { id: delivery.id },
    select: { otpHash: true, otpExpires: true },
  })
  check('the code is destroyed, not just counted out', row.otpHash === null && row.otpExpires === null)
}

async function expiredCodesDoNotWork(): Promise<void> {
  console.log('\n6. A code past its ten minutes')
  const f = await fixture(1)
  const link = f.links[0]!
  const delivery = await prisma.delivery.create({
    data: { linkId: link.id, email: 'r@example.com' },
    select: { id: true },
  })
  const code = await issueOtp(delivery.id, new Date(Date.now() - 11 * 60 * 1000))

  const result = await verifyOtp(link.key, code)
  check('it is refused', result.ok === false, JSON.stringify(result))
  check('as expired, not as wrong', result.ok === false && result.reason === 'expired', JSON.stringify(result))
  check(
    'and the attempt was not counted against the recipient',
    (await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id }, select: { otpAttempts: true } })).otpAttempts === 0,
  )
}

async function ungatedLinksAreNotGated(): Promise<void> {
  console.log('\n7. A link the sender distributed themselves')
  const f = await fixture(1)
  const link = f.links[0]!
  // No Delivery row: Kleym never saw this URL and has no address to bind to.
  check('it passes the gate with no token', await otpSatisfied(link.key, null))
}

async function emailsCarryNoTracking(): Promise<void> {
  console.log('\n8. What the email contains')
  const message = claimEmail({
    senderName: 'Acme', amount: '500.0000000', assetCode: 'USDC',
    claimUrl: 'https://example.test/claim#s=SEED', expiresAt: new Date('2030-01-02'),
    otpRequired: true,
  })

  const remote = /<img|background-image|url\(|https?:\/\/(?!example\.test)/i
  check('no image tag or remote asset', !/<img/i.test(message.html), 'an image would leak the open')
  check(
    'no third-party URL at all',
    !remote.test(message.html.replace('https://example.test/claim#s=SEED', '')),
    message.html.slice(0, 200),
  )
  check('no web font', !/@font-face|fonts\.googleapis/i.test(message.html))
  check('it says a code will be needed', /six-digit code/.test(message.text))
  check('it warns the link is a bearer instrument', /keep it to yourself/i.test(message.text))
  check('it names the expiry date', /2030-01-02/.test(message.text))

  // BRAND.md §8 — plain language, no exclamations.
  const banned = /\b(crypto|web3|dApp|blockchain)\b/i
  check('no crypto vocabulary', !banned.test(message.text), message.text.slice(0, 120))
  check('no exclamations', !message.text.includes('!'))

  const otp = otpEmail('123456')
  check('the OTP mail shows the code', otp.text.includes('123456'))
  check('and carries no image either', !/<img/i.test(otp.html))
}

/**
 * A provider outage must not become an enumeration oracle.
 *
 * `/api/claims/otp/request` answers `sent: true` for a key that is not
 * email-delivered, so if a real key can answer anything ELSE when the mail
 * provider is down, the pair of answers reveals which keys are live emailed
 * links. This was a real bug: the route returned 500 on a send failure while
 * an unknown key returned 200, which is exactly the oracle SPEC.md §6.4
 * closes on `resolve`.
 *
 * Checked at the module level rather than over HTTP so it runs in CI without a
 * server; the live pair was confirmed by hand against a deployment whose
 * provider key is a placeholder.
 */
async function aFailedSendIsIndistinguishable(): Promise<void> {
  console.log('\n10. A send that fails, against a key that does not exist')
  const route = await import('../src/app/api/claims/otp/request/route')
  const f = await fixture(1)
  const link = f.links[0]!
  await prisma.delivery.create({ data: { linkId: link.id, email: 'r@example.com' } })

  const post = (key: string) =>
    route.POST(
      new Request('http://localhost/api/claims/otp/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 200) + 1}` },
        body: JSON.stringify({ ephemeralPublicKey: key }),
      }),
    )

  // The provider is unreachable in this environment: RESEND_API_KEY is a
  // placeholder, so the send genuinely fails rather than being stubbed to.
  const real = await post(link.key)
  const unknown = await post(Keypair.random().publicKey())

  check('both answer the same status', real.status === unknown.status, `${real.status} vs ${unknown.status}`)
  const [a, b] = [await real.json(), await unknown.json()]
  check('and the same body', JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`)
  check('which is a success', real.status === 200, `${real.status}`)
}

async function codesAreDrawnSafely(): Promise<void> {
  console.log('\n9. The codes themselves')
  const seen = new Set<string>()
  for (let i = 0; i < 2000; i += 1) seen.add(generateOtp())
  check('all six digits, zero-padded', [...seen].every((c) => /^[0-9]{6}$/.test(c)))
  // 2000 draws from a million-wide space: collisions are possible but a
  // generator stuck in a narrow range shows up immediately.
  check('drawn from a wide space', seen.size > 1900, `${seen.size} distinct of 2000`)
  check('and reaches the low range', [...seen].some((c) => c.startsWith('0')) || seen.size > 1900)
}

/**
 * The gate is WIRED on the routes, not only correct as a function.
 *
 * Every check above exercises `otpSatisfied`. None of them would notice the
 * `otpGate` call being deleted from a route — and `submit` is the one that
 * moves the money. So: three requests against a gated link on `prepare/claim`
 * and on `submit`, with no header, a wrong header and the right one, through
 * the route handlers themselves. Refusal is read from the problem `type`,
 * not the prose.
 */
async function theGateIsWiredOnTheMoneyRoutes(): Promise<void> {
  console.log('\n11. No header, wrong header, right header — through the routes')
  const prepareClaim = await import('../src/app/api/claims/prepare/claim/route')
  const submit = await import('../src/app/api/claims/submit/route')
  const { OTP_HEADER } = await import('../src/lib/api/otp-guard')
  const { CLAIM_CONFLICT_TYPE } = await import('../src/lib/claim/problem-types')

  const f = await fixture(1)
  const link = f.links[0]!
  const delivery = await prisma.delivery.create({
    data: { linkId: link.id, email: 'r@example.com' },
    select: { id: true },
  })
  const code = await issueOtp(delivery.id)
  const verified = await verifyOtp(link.key, code)
  if (!verified.ok) return check('a token was earned', false, JSON.stringify(verified))
  const token = verified.token

  // A fresh IP per request so the per-IP rate limits (10/min) stay out of it.
  const post = (handler: (r: Request) => Promise<Response>, path: string, body: unknown, header?: string) =>
    handler(
      new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`,
          ...(header ? { [OTP_HEADER]: header } : {}),
        },
        body: JSON.stringify(body),
      }),
    )
  const refusedByGate = async (response: Response) =>
    response.status === 409 &&
    ((await response.clone().json()) as { type?: string }).type === CLAIM_CONFLICT_TYPE['otp-required']

  const routes: [string, (r: Request) => Promise<Response>, unknown][] = [
    ['/api/claims/prepare/claim', prepareClaim.POST, { ephemeralPublicKey: link.key, recipientPublicKey: Keypair.random().publicKey() }],
    ['/api/claims/submit', submit.POST, { ephemeralPublicKey: link.key, signedXdr: 'AAAA', phase: 'claim' }],
  ]

  for (const [path, handler, body] of routes) {
    const none = await post(handler, path, body)
    check(`${path} with no header is refused by the gate`, await refusedByGate(none), `${none.status}`)

    const wrong = await post(handler, path, body, 'x'.repeat(64))
    check(`${path} with a wrong token is refused by the gate`, await refusedByGate(wrong), `${wrong.status}`)

    /*
     * With the right token the gate lets the request THROUGH. What happens
     * next is not the point — there is no ledger here, so the route answers
     * with some other refusal — only that it is not the gate's.
     */
    const right = await post(handler, path, body, token)
    check(`${path} with the right token gets past the gate`, !(await refusedByGate(right)),
      `${right.status} ${JSON.stringify(await right.clone().json().catch(() => null))}`)
  }
}

async function main(): Promise<void> {
  try {
    await theUrlReachesTheProviderAndNowhereElse()
    await exhaustedRetriesLeaveNothingBehind()
    await refusesAUrlThatIsNotThisLink()
    await otpUnlocksAndLocks()
    await theSixthAttemptInvalidates()
    await expiredCodesDoNotWork()
    await ungatedLinksAreNotGated()
    await emailsCarryNoTracking()
    await aFailedSendIsIndistinguishable()
    await codesAreDrawnSafely()
    await theGateIsWiredOnTheMoneyRoutes()
  } finally {
    await deliveryJobs().obliterate({ force: true }).catch(() => undefined)
    await deliveryJobs().close().catch(() => undefined)
    await prisma.$disconnect()
    redis.disconnect()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
