/**
 * Verification for compliance hooks (#52). Real Postgres, a real local HTTP
 * receiver standing in for the organisation's screening provider.
 *
 * What is proven: the callback is asked before an envelope exists, with the
 * terms and recipient references; a hold or block stops `prepareBatch` and
 * `submitBatch` and the reason reaches the sender; a timeout, a 5xx and an
 * unreadable body all HOLD (fail closed); a block is final; an ALLOW is
 * bound to what was screened; with no URL nothing is called or written;
 * attestation fields never reach `resolveLink`; and the regulator export
 * is scoped to one organisation and verifies with the public key alone.
 *
 * Run: pnpm verify:compliance
 */
import { createHmac, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { Keypair } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'

applyEnvPlaceholders()
process.env.SCREENING_TIMEOUT_MS = '700'
process.env.SCREENING_WEBHOOK_SECRET = 'verify-compliance-secret'
// A Horizon nobody answers: reaching it is proof the gate let a call through.
process.env.HORIZON_URL = 'http://127.0.0.1:9'

const { prisma } = await import('../src/lib/db/client')
const { registerLinks } = await import('../src/lib/api/links')
const { prepareBatch, submitBatch } = await import('../src/lib/api/batches')
const { screeningGate, screeningUrlSchema, screeningUrlSchemaFor, SCREENING_DETAIL } = await import('../src/lib/api/screening')
const { resolveLink } = await import('../src/lib/api/claims')
const { regulatorRows, buildRegulatorExport, REGULATOR_COLUMNS } = await import('../src/lib/api/regulator-export')
const { verifyBytes } = await import('../src/lib/api/audit-chain')

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/* ── the stand-in provider ─────────────────────────────────────────────── */

type Mode = 'allow' | 'hold' | 'block' | 'timeout' | 'error' | 'garbage'
const provider = {
  mode: 'allow' as Mode,
  requests: [] as { body: Record<string, unknown>; signature: string | undefined; raw: string }[],
}
const server: Server = createServer((req, res) => {
  let raw = ''
  req.on('data', (chunk) => (raw += chunk))
  req.on('end', () => {
    provider.requests.push({ body: JSON.parse(raw), signature: req.headers['x-kleym-signature'] as string | undefined, raw })
    const answer = (status: number, body: string) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(body)
    }
    switch (provider.mode) {
      case 'allow': return answer(200, JSON.stringify({ decision: 'allow', reference: 'CASE-1' }))
      case 'hold': return answer(200, JSON.stringify({ decision: 'hold', reason: 'Manual review opened (ref 77).', reference: 'CASE-77' }))
      case 'block': return answer(200, JSON.stringify({ decision: 'block', reason: 'Recipient category not permitted.' }))
      case 'timeout': return void setTimeout(() => answer(200, JSON.stringify({ decision: 'allow' })), 3000)
      case 'error': return answer(500, 'boom')
      case 'garbage': return answer(200, '{"decision":"maybe"}')
    }
  })
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = (server.address() as { port: number }).port
const SCREEN_URL = `http://127.0.0.1:${port}/screen`
const lastRequest = () => provider.requests.at(-1)!

/* ── fixtures ──────────────────────────────────────────────────────────── */

async function user(tag: string) {
  return prisma.user.create({ data: { username: `${tag}-${randomUUID().slice(0, 8)}`, passwordHash: 'x', role: 'SENDER' }, select: { id: true, username: true } })
}
async function org(ownerId: string, screeningUrl: string | null) {
  return prisma.organization.create({
    data: { name: `cmp-${randomUUID().slice(0, 6)}`, screeningUrl, memberships: { create: [{ userId: ownerId, role: 'OWNER' }] } },
    select: { id: true, name: true },
  })
}
const ATTESTATIONS = [
  { reference: 'PAY-2026-001', category: 'payroll', note: 'September salary' },
  { reference: 'PAY-2026-002', category: 'payroll', note: null },
  null,
]
async function campaign(orgId: string, creator: string, withAttestation = true) {
  const c = await prisma.campaign.create({
    data: {
      organizationId: orgId, userId: creator, name: 'cmp', network: 'testnet', senderPublicKey: Keypair.random().publicKey(),
      assetCode: 'XLM', amountPerLink: '5', linkCount: 3, expiresAt: new Date(Date.now() + 86_400_000), status: 'DRAFT',
      csvExportedAt: new Date(),
    },
    select: { id: true },
  })
  const keys = Array.from({ length: 3 }, () => Keypair.random().publicKey())
  const reg = await registerLinks(c.id, orgId, keys, ['alice', 'bob', 'carol'], withAttestation ? ATTESTATIONS : undefined)
  if (reg.kind !== 'ok') throw new Error(`fixture: ${reg.kind}`)
  return { id: c.id, keys }
}
async function screening(campaignId: string) {
  return prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { screeningDecision: true, screeningReason: true, screeningHash: true, screenedAt: true } })
}
/** Past the gate, prepareBatch tries Horizon — which here is a closed port. That throw IS the pass. */
async function prepareOutcome(campaignId: string, orgId: string): Promise<{ kind: string; detail?: string }> {
  try {
    const out = await prepareBatch(campaignId, orgId, {})
    return out.kind === 'conflict' ? { kind: 'conflict', detail: out.detail } : { kind: out.kind }
  } catch (error) {
    return { kind: 'horizon', detail: error instanceof Error ? error.message : String(error) }
  }
}
const isScreening = (o: { kind: string; detail?: string }) => o.kind === 'conflict' && /^Screening/.test(o.detail ?? '')

/* ── 1. the callback sees the terms and references, signed ─────────────── */

async function callbackIsInvoked(): Promise<void> {
  console.log('\n1. A configured callback is invoked before submission, with terms and references')
  const owner = await user('owner')
  const o = await org(owner.id, SCREEN_URL)
  const c = await campaign(o.id, owner.id)
  provider.mode = 'allow'
  const before = provider.requests.length
  const out = await prepareOutcome(c.id, o.id)
  check('the callback was called exactly once', provider.requests.length === before + 1)
  const req = lastRequest()
  const body = req.body as { version: number; campaign: Record<string, unknown>; organization: Record<string, unknown>; recipients: Record<string, unknown>[] }
  check('with the documented version and the campaign terms', body.version === 1 && body.campaign.id === c.id && body.campaign.amountPerLink === '5' && body.campaign.linkCount === 3 && body.campaign.createdBy === owner.username, JSON.stringify(body.campaign))
  check('and the organisation', body.organization.id === o.id && body.organization.name === o.name)
  check('and one recipient per link with its reference fields', body.recipients.length === 3 && body.recipients[0]!.reference === 'PAY-2026-001' && body.recipients[0]!.category === 'payroll' && body.recipients[0]!.label === 'alice' && body.recipients[2]!.reference === null, JSON.stringify(body.recipients))
  check('no recipient carries key material: no seed-shaped string, no ephemeral public key', !/S[A-Z2-7]{55}/.test(req.raw) && c.keys.every((k) => !req.raw.includes(k)))
  const expected = `sha256=${createHmac('sha256', 'verify-compliance-secret').update(req.raw).digest('hex')}`
  check('the request is HMAC-signed over its exact bytes', req.signature === expected, `${req.signature}`)
  check('an ALLOW lets prepareBatch past the gate (it went on to Horizon)', out.kind === 'horizon' && !isScreening(out), JSON.stringify(out))
  const row = await screening(c.id)
  check('the ALLOW is recorded on the campaign, bound to a hash', row.screeningDecision === 'ALLOW' && row.screeningReason === null && !!row.screeningHash && row.screenedAt !== null)
  const audit = await prisma.auditLog.findFirst({ where: { action: 'campaign.screening', entityId: c.id }, orderBy: { createdAt: 'desc' } })
  check('and audited with the provider reference, not shown to anyone', (audit?.metadata as Record<string, unknown>)?.providerReference === 'CASE-1' && (audit?.metadata as Record<string, unknown>)?.source === 'callback', JSON.stringify(audit?.metadata))
}

/* ── 2. hold and block stop submission, and say why ────────────────────── */

async function holdAndBlock(): Promise<void> {
  console.log('\n2. A hold or a block prevents submission; the reason reaches the sender')
  const owner = await user('owner')
  const o = await org(owner.id, SCREEN_URL)
  const c = await campaign(o.id, owner.id)

  provider.mode = 'hold'
  const held = await prepareOutcome(c.id, o.id)
  check('hold: prepareBatch hands over nothing', isScreening(held) && /hold/.test(held.detail ?? ''), JSON.stringify(held))
  check('and the provider\'s reason is in the detail', /Manual review opened \(ref 77\)/.test(held.detail ?? ''), held.detail)
  check('but not its case reference', !/CASE-77/.test(held.detail ?? ''))
  check('recorded as HOLD with the reason', (await screening(c.id)).screeningDecision === 'HOLD' && (await screening(c.id)).screeningReason === 'Manual review opened (ref 77).')
  const submitHeld = await submitBatch(c.id, o.id, { sequence: 1, signedXdr: 'AAAA' })
  check('submitBatch asks again after a hold and is refused too', submitHeld.kind === 'conflict' && /Screening hold/.test(submitHeld.detail), JSON.stringify(submitHeld))

  provider.mode = 'allow'
  const now = await prepareOutcome(c.id, o.id)
  check('the next attempt asks the provider again, and a hold lifts', now.kind === 'horizon', JSON.stringify(now))

  provider.mode = 'block'
  const blocked = await prepareOutcome(c.id, o.id)
  check('block: refused with the reason', isScreening(blocked) && /Screening block/.test(blocked.detail ?? '') && /category not permitted/.test(blocked.detail ?? ''), JSON.stringify(blocked))
  const calls = provider.requests.length
  provider.mode = 'allow'
  const still = await prepareOutcome(c.id, o.id)
  check('a block is final: not asked again, still refused', isScreening(still) && /block/.test(still.detail ?? '') && provider.requests.length === calls, JSON.stringify(still))
  const submitBlocked = await submitBatch(c.id, o.id, { sequence: 1, signedXdr: 'AAAA' })
  check('and submitBatch refuses without a call', submitBlocked.kind === 'conflict' && /Screening block/.test(submitBlocked.detail) && provider.requests.length === calls)
}

/* ── 3. fail closed ────────────────────────────────────────────────────── */

async function failsClosed(): Promise<void> {
  console.log('\n3. A callback that times out or errors fails CLOSED')
  const owner = await user('owner')
  const o = await org(owner.id, SCREEN_URL)
  const c = await campaign(o.id, owner.id)

  provider.mode = 'timeout'
  const started = Date.now()
  const timedOut = await prepareOutcome(c.id, o.id)
  const took = Date.now() - started
  check('timeout: held, not allowed', isScreening(timedOut) && timedOut.detail === SCREENING_DETAIL.unavailable, JSON.stringify(timedOut))
  check('within the configured budget, not the provider\'s', took < 2500, `${took}ms`)
  const t = await screening(c.id)
  check('recorded as HOLD with no reason to show', t.screeningDecision === 'HOLD' && t.screeningReason === null)
  const audit = await prisma.auditLog.findFirst({ where: { action: 'campaign.screening', entityId: c.id }, orderBy: { createdAt: 'desc' } })
  check('the audit row says the provider did not decide', (audit?.metadata as Record<string, unknown>)?.source === 'timeout', JSON.stringify(audit?.metadata))

  provider.mode = 'error'
  const errored = await prepareOutcome(c.id, o.id)
  check('5xx: held', isScreening(errored) && errored.detail === SCREENING_DETAIL.unavailable, JSON.stringify(errored))

  provider.mode = 'garbage'
  const garbage = await prepareOutcome(c.id, o.id)
  check('an unreadable answer: held', isScreening(garbage) && garbage.detail === SCREENING_DETAIL.unavailable, JSON.stringify(garbage))

  // A URL nobody listens on.
  await prisma.organization.update({ where: { id: o.id }, data: { screeningUrl: 'http://127.0.0.1:9/screen' } })
  const refused = await prepareOutcome(c.id, o.id)
  check('connection refused: held', isScreening(refused) && refused.detail === SCREENING_DETAIL.unavailable, JSON.stringify(refused))
  check('nothing in any of these went past the gate', (await screening(c.id)).screeningDecision === 'HOLD')
}

/* ── 4. an ALLOW is bound to what was screened ─────────────────────────── */

async function allowIsBound(): Promise<void> {
  console.log('\n4. submitBatch honours an ALLOW only for exactly what was screened')
  const owner = await user('owner')
  const o = await org(owner.id, SCREEN_URL)
  const c = await campaign(o.id, owner.id)
  provider.mode = 'allow'
  await prepareOutcome(c.id, o.id)
  const calls = provider.requests.length
  const submitted = await submitBatch(c.id, o.id, { sequence: 1, signedXdr: 'AAAA' })
  check('submit after an ALLOW does not ask again', provider.requests.length === calls && !(submitted.kind === 'conflict' && /Screening/.test(submitted.detail)), JSON.stringify(submitted))

  await prisma.claimLink.updateMany({ where: { campaignId: c.id, reference: 'PAY-2026-002' }, data: { reference: 'PAY-2026-999' } })
  provider.mode = 'hold'
  const changed = await submitBatch(c.id, o.id, { sequence: 1, signedXdr: 'AAAA' })
  check('a changed recipient reference invalidates the ALLOW: asked again, and held', provider.requests.length === calls + 1 && changed.kind === 'conflict' && /Screening hold/.test(changed.detail), JSON.stringify(changed))

  provider.mode = 'allow'
  await prepareOutcome(c.id, o.id)
  const again = provider.requests.length
  await prisma.organization.update({ where: { id: o.id }, data: { screeningUrl: `${SCREEN_URL}?provider=other` } })
  await submitBatch(c.id, o.id, { sequence: 1, signedXdr: 'AAAA' })
  check('a different callback URL invalidates it too', provider.requests.length === again + 1)
}

/* ── 5. no callback: nothing happens ───────────────────────────────────── */

async function noCallbackIsInert(): Promise<void> {
  console.log('\n5. With no callback configured, behaviour is what it was')
  const owner = await user('owner')
  const o = await org(owner.id, null)
  const c = await campaign(o.id, owner.id)
  const calls = provider.requests.length
  const realFetch = globalThis.fetch
  let fetches = 0
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
    fetches += 1
    return realFetch(...args)
  }) as typeof fetch
  let out: { kind: string; detail?: string }
  try {
    check('the gate itself answers null', (await screeningGate(c.id, { fresh: true })) === null)
    out = await prepareOutcome(c.id, o.id)
  } finally {
    globalThis.fetch = realFetch
  }
  check('prepareBatch went straight through to Horizon', out.kind === 'horizon', JSON.stringify(out))
  check('no HTTP call of any kind was made from the gate', provider.requests.length === calls && fetches === 0, `fetches=${fetches}`)
  const row = await screening(c.id)
  check('nothing was written to the campaign', row.screeningDecision === null && row.screeningHash === null && row.screenedAt === null)
  check('and no audit row exists', (await prisma.auditLog.count({ where: { action: 'campaign.screening', entityId: c.id } })) === 0)
}

/* ── 6. attestation never reaches the claim path ───────────────────────── */

async function attestationStaysServerSide(): Promise<void> {
  console.log('\n6. Attestation fields are stored, and absent from the claim path')
  const owner = await user('owner')
  const o = await org(owner.id, null)
  const c = await campaign(o.id, owner.id)
  const links = await prisma.claimLink.findMany({ where: { campaignId: c.id }, orderBy: { createdAt: 'asc' }, select: { ephemeralPublicKey: true, reference: true, category: true, note: true } })
  check('registerLinks stored reference, category and note', links.some((l) => l.reference === 'PAY-2026-001' && l.category === 'payroll' && l.note === 'September salary') && links.some((l) => l.reference === null && l.note === null))

  await prisma.campaign.update({ where: { id: c.id }, data: { status: 'ACTIVE' } })
  await prisma.claimLink.updateMany({ where: { campaignId: c.id }, data: { status: 'ACTIVE' } })
  const withRef = links.find((l) => l.reference !== null)!
  const without = links.find((l) => l.reference === null)!
  const a = await resolveLink(withRef.ephemeralPublicKey)
  const b = await resolveLink(without.ephemeralPublicKey)
  check('resolveLink has the same keys for a link with and without attestation', JSON.stringify(Object.keys(a)) === JSON.stringify(Object.keys(b)), JSON.stringify(Object.keys(a)))
  const text = JSON.stringify(a)
  check('and none of the attestation values appear in it', !/PAY-2026|payroll|September salary|reference|category|note/.test(text), text)
  const { readFileSync } = await import('node:fs')
  const claims = readFileSync(new URL('../src/lib/api/claims.ts', import.meta.url), 'utf8')
  check('claims.ts selects none of the attestation columns', !/reference: true|category: true|note: true/.test(claims))
}

/* ── 7. regulator export ───────────────────────────────────────────────── */

async function regulatorExport(): Promise<void> {
  console.log('\n7. The regulator export is scoped to one organisation, signed and verifiable')
  const owner = await user('owner')
  const o = await org(owner.id, null)
  const c = await campaign(o.id, owner.id)
  const other = await user('other')
  const otherOrg = await org(other.id, null)
  const foreign = await campaign(otherOrg.id, other.id)
  await prisma.claimLink.updateMany({ where: { campaignId: c.id, reference: 'PAY-2026-001' }, data: { status: 'CLAIMED', claimedBy: Keypair.random().publicKey(), claimedAt: new Date(), claimTxHash: 'ab'.repeat(32) } })

  const rows = await regulatorRows({ organizationId: o.id })
  check('one row per link of the organisation\'s campaigns', rows.length === 3 && rows.every((r) => r.campaignId === c.id))
  check('and none from another organisation', !rows.some((r) => r.campaignId === foreign.id))
  const claimed = rows.find((r) => r.reference === 'PAY-2026-001')!
  check('who sent what, to whom, when, and the transaction', claimed.createdBy === owner.username && claimed.amountPerLink === '5' && claimed.category === 'payroll' && claimed.claimedBy !== null && claimed.claimTxHash === 'ab'.repeat(32) && claimed.linkStatus === 'CLAIMED', JSON.stringify(claimed))
  check('no delivery email column', !(REGULATOR_COLUMNS as readonly string[]).includes('email'))

  const q = { organizationId: o.id, organizationName: o.name }
  const json = buildRegulatorExport(rows, q, 'json')
  const csv = buildRegulatorExport(rows, q, 'csv')
  check('json and csv are both signed and verify with the public key alone', verifyBytes(json.body, json.signature, json.publicKey) && verifyBytes(csv.body, csv.signature, csv.publicKey))
  const flipped = Buffer.from(json.body)
  flipped[flipped.length - 3] ^= 1
  check('one flipped byte fails verification', !verifyBytes(flipped, json.signature, json.publicKey))
  const doc = JSON.parse(json.body.toString('utf8')) as { format: string; organization: { id: string }; count: number }
  check('the JSON names its format and organisation', doc.format === 'kleym-regulator-export' && doc.organization.id === o.id && doc.count === 3)
  check('the CSV header is the documented column list', csv.body.toString('utf8').split('\n')[0] === REGULATOR_COLUMNS.join(','))
  const window = await regulatorRows({ organizationId: o.id, to: new Date(Date.now() - 3_600_000) })
  check('a date window applies', window.length === 0)
}

/* ── 8. the URL an owner may set ───────────────────────────────────────── */

function urlSchema(): void {
  console.log('\n8. Only a URL Kleym should call can be configured')
  const ok = (v: unknown) => screeningUrlSchema.safeParse({ screeningUrl: v }).success
  check('https is accepted', ok('https://compliance.example.com/kleym'))
  check('null switches it off', ok(null))
  check('loopback http is accepted for a local receiver', ok('http://127.0.0.1:8080/screen'))
  check('plain http elsewhere is refused', !ok('http://compliance.example.com/kleym'))
  check('credentials in the URL are refused', !ok('https://user:pw@compliance.example.com/kleym'))
  check('other schemes are refused', !ok('ftp://x.example.com/'))
  // The Owner is a tenant. In production the loopback exception would be a
  // blind SSRF into whatever shares the application host.
  const prod = (v: unknown) => screeningUrlSchemaFor('production').safeParse({ screeningUrl: v }).success
  check('in production, loopback http is refused', !prod('http://127.0.0.1:8080/screen') && !prod('http://localhost/screen') && !prod('http://[::1]/screen'))
  check('in production, https is still accepted and null still switches it off', prod('https://compliance.example.com/kleym') && prod(null))
}

async function main(): Promise<void> {
  try {
    await callbackIsInvoked()
    await holdAndBlock()
    await failsClosed()
    await allowIsBound()
    await noCallbackIsInert()
    await attestationStaysServerSide()
    await regulatorExport()
    urlSchema()
  } finally {
    await prisma.$disconnect()
    server.close()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
