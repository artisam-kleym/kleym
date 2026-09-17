/**
 * Claim policies (#79), verified at the ROUTE level against a real database.
 *
 * The review of #14 found the OTP gate correct and its wiring untested; this
 * repeats that lesson for every policy. For each of OPEN-emailed, CODE and
 * PASSKEY: a gated link, three requests — no credential, a wrong one, the
 * right one — on `prepare/materialise`, `prepare/claim` AND `submit`, through
 * the route handlers themselves. Refusal is read from the problem `type`.
 *
 * Also: `resolve` is byte-identical across unknown, expired, claimed and
 * cancelled links under every policy; the code is stored hashed and never
 * in the clear; five wrong codes lock the link for fifteen minutes.
 *
 *   pnpm verify:claim-policies   (needs Postgres + Redis)
 */
import { randomUUID } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { redis } = await import('../src/lib/redis/client')
const { CLAIM_CONFLICT_TYPE } = await import('../src/lib/claim/problem-types')
const { POLICY_TOKEN_HEADER, hashClaimCode, issueClaimToken, verifyClaimCode } = await import('../src/lib/api/claim-policy')
const { issueOtp, verifyOtp } = await import('../src/lib/api/otp')
const { resolveLink, unavailableLink } = await import('../src/lib/api/claims')
const materialise = await import('../src/app/api/claims/prepare/materialise/route')
const prepareClaim = await import('../src/app/api/claims/prepare/claim/route')
const submit = await import('../src/app/api/claims/submit/route')

let failures = 0
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failures += 1
}

type Policy = 'OPEN' | 'CODE' | 'EMAIL' | 'PASSKEY'

async function fixture(policy: Policy, over: { status?: 'ACTIVE' | 'EXPIRED' | 'CLAIMED'; campaignStatus?: 'ACTIVE' | 'CANCELLED'; expiresAt?: Date } = {}) {
  const user = await prisma.user.create({ data: { username: `pol-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' }, select: { id: true } })
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id, organizationId: await personalOrg(prisma, user.id), name: `verify-policy-${policy}`, network: 'testnet',
      senderPublicKey: Keypair.random().publicKey(), assetCode: 'XLM', amountPerLink: '1.0000000', linkCount: 1,
      expiresAt: over.expiresAt ?? new Date(Date.now() + 30 * 86_400_000), status: over.campaignStatus ?? 'ACTIVE', claimPolicy: policy,
    },
    select: { id: true },
  })
  const key = Keypair.random().publicKey()
  const code = '0123456789ABC'
  const link = await prisma.claimLink.create({
    data: {
      campaignId: campaign.id, ephemeralPublicKey: key, status: over.status ?? 'ACTIVE', amount: '1.0000000',
      balanceId: `00000000${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`.slice(0, 72),
      codeHash: policy === 'CODE' ? hashClaimCode(code) : null,
    },
    select: { id: true },
  })
  return { campaignId: campaign.id, linkId: link.id, key, code }
}

const post = (handler: (r: Request) => Promise<Response>, path: string, body: unknown, header?: string) =>
  handler(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // A fresh IP per request so the per-IP limits stay out of it.
        'x-forwarded-for': `10.2.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`,
        ...(header ? { [POLICY_TOKEN_HEADER]: header } : {}),
      },
      body: JSON.stringify(body),
    }),
  )

const refusedWith = async (response: Response, reason: keyof typeof CLAIM_CONFLICT_TYPE) =>
  response.status === 409 && ((await response.clone().json()) as { type?: string }).type === CLAIM_CONFLICT_TYPE[reason]

async function gateOnEveryAction(label: string, key: string, token: string, reason: keyof typeof CLAIM_CONFLICT_TYPE): Promise<void> {
  const routes: [string, (r: Request) => Promise<Response>, unknown][] = [
    ['/api/claims/prepare/materialise', materialise.POST, { ephemeralPublicKey: key }],
    ['/api/claims/prepare/claim', prepareClaim.POST, { ephemeralPublicKey: key, recipientPublicKey: Keypair.random().publicKey() }],
    ['/api/claims/submit', submit.POST, { ephemeralPublicKey: key, signedXdr: 'AAAA', phase: 'claim' }],
  ]
  for (const [path, handler, body] of routes) {
    const none = await post(handler, path, body)
    check(`${label}: ${path} with no credential is refused (${reason})`, await refusedWith(none, reason), `${none.status}`)
    const wrong = await post(handler, path, body, 'x'.repeat(64))
    check(`${label}: ${path} with a wrong token is refused (${reason})`, await refusedWith(wrong, reason), `${wrong.status}`)
    // With the right token the GATE lets it through; what happens next (no ledger here) is not the point.
    const right = await post(handler, path, body, token)
    check(`${label}: ${path} with the right token gets past the gate`, !(await refusedWith(right, reason)), `${right.status}`)
  }
}

async function openEmailedKeepsTheOtpGate(): Promise<void> {
  console.log('\n1. OPEN, emailed: the OTP gate of #14, unchanged, on all three actions')
  const f = await fixture('OPEN')
  const delivery = await prisma.delivery.create({ data: { linkId: f.linkId, email: 'r@example.com' }, select: { id: true } })
  const otp = await issueOtp(delivery.id)
  const verified = await verifyOtp(f.key, otp)
  if (!verified.ok) return check('an OTP token was earned', false, JSON.stringify(verified))
  await gateOnEveryAction('open+email', f.key, verified.token, 'otp-required')

  console.log('\n1b. OPEN, not emailed: no gate at all')
  const g = await fixture('OPEN')
  const none = await post(prepareClaim.POST, '/api/claims/prepare/claim', { ephemeralPublicKey: g.key, recipientPublicKey: Keypair.random().publicKey() })
  check('an open link is not refused by any gate', !(await refusedWith(none, 'otp-required')) && !(await refusedWith(none, 'code-required')) && !(await refusedWith(none, 'passkey-required')), `${none.status}`)
}

async function codePolicy(): Promise<void> {
  console.log('\n2. CODE: the claim code, hashed at rest, five attempts then a lock, on all three actions')
  const f = await fixture('CODE')
  const row = await prisma.claimLink.findUniqueOrThrow({ where: { id: f.linkId }, select: { codeHash: true } })
  check('the code is stored as a hash, not in the clear', row.codeHash !== null && row.codeHash !== f.code && !row.codeHash!.includes(f.code), `${row.codeHash}`)

  const wrong = await verifyClaimCode(f.key, '0123456789ABD', '203.0.113.1')
  check('a wrong code is refused with attempts left', !wrong.ok && wrong.reason === 'wrong' && wrong.attemptsLeft === 4, JSON.stringify(wrong))
  const right = await verifyClaimCode(f.key, f.code.toLowerCase(), '203.0.113.1')
  if (!right.ok) return check('the right code earns a token (case-insensitively)', false, JSON.stringify(right))
  check('the right code earns a token (case-insensitively)', true)
  await gateOnEveryAction('code', f.key, right.token, 'code-required')

  console.log('\n2b. CODE: lockout is per caller, so a passer-by reading the ledger cannot hold the link shut')
  const g = await fixture('CODE')
  for (let i = 0; i < 5; i += 1) await verifyClaimCode(g.key, '0123456789ABD', '203.0.113.1')
  const locked = await verifyClaimCode(g.key, g.code, '203.0.113.1')
  check('the fifth wrong guess locks THIS caller, and the right code is refused from it while locked', !locked.ok && locked.reason === 'locked', JSON.stringify(locked))
  const other = await verifyClaimCode(g.key, g.code, '203.0.113.2')
  check('the recipient, from another address, is not locked out by those guesses', other.ok, JSON.stringify(other))
}

async function passkeyPolicy(): Promise<void> {
  console.log('\n3. PASSKEY: the gate on all three actions (the WebAuthn ceremony itself needs a browser)')
  const f = await fixture('PASSKEY')
  // A token as the register/authenticate routes would issue it, once the ceremony verified.
  const token = await issueClaimToken(f.linkId)
  await gateOnEveryAction('passkey', f.key, token, 'passkey-required')
}

async function emailPolicyRefusesUndelivered(): Promise<void> {
  console.log('\n4. EMAIL: a link the sender distributed themselves cannot be claimed')
  const f = await fixture('EMAIL')
  const none = await post(prepareClaim.POST, '/api/claims/prepare/claim', { ephemeralPublicKey: f.key, recipientPublicKey: Keypair.random().publicKey() })
  check('refused as otp-required with no delivery row', await refusedWith(none, 'otp-required'), `${none.status}`)
  const token = await issueClaimToken(f.linkId)
  const withToken = await post(prepareClaim.POST, '/api/claims/prepare/claim', { ephemeralPublicKey: f.key, recipientPublicKey: Keypair.random().publicKey() }, token)
  check('and a policy token does not substitute for the email', await refusedWith(withToken, 'otp-required'), `${withToken.status}`)
}

async function resolveIsByteIdentical(): Promise<void> {
  console.log('\n5. resolve is byte-identical across unknown, expired, claimed and cancelled, under every policy')
  const baseline = JSON.stringify(unavailableLink())
  check('the unavailable answer says policy open and passkeyBound false', baseline.includes('"policy":"open"') && baseline.includes('"passkeyBound":false'), baseline)
  const unknown = JSON.stringify(await resolveLink(Keypair.random().publicKey()))
  check('unknown key matches the baseline', unknown === baseline, unknown)
  for (const policy of ['OPEN', 'CODE', 'EMAIL', 'PASSKEY'] as Policy[]) {
    const expired = await fixture(policy, { expiresAt: new Date(Date.now() - 1000) })
    const claimed = await fixture(policy, { status: 'CLAIMED' })
    const cancelled = await fixture(policy, { campaignStatus: 'CANCELLED' })
    for (const [name, f] of [['expired', expired], ['claimed', claimed], ['cancelled', cancelled]] as const) {
      const body = JSON.stringify(await resolveLink(f.key))
      check(`${policy} ${name} matches the baseline byte for byte`, body === baseline, body)
    }
    const live = await resolveLink((await fixture(policy)).key)
    check(`${policy} live link reports its policy`, live.status === 'claimable' && live.policy === policy.toLowerCase(), JSON.stringify(live))
  }
}

async function main(): Promise<void> {
  try {
    await openEmailedKeepsTheOtpGate()
    await codePolicy()
    await passkeyPolicy()
    await emailPolicyRefusesUndelivered()
    await resolveIsByteIdentical()
  } finally {
    await prisma.$disconnect()
    await redis.quit().catch(() => undefined)
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
