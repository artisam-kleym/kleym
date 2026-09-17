/**
 * Verification for dual control (#45). Real Postgres.
 *
 * The gate is exercised through `prepareBatch` — the function the signing
 * route calls, with a stubbed Horizon account load — and through
 * `settleCampaignStatus`, so what is proven is that no envelope is handed
 * over and no campaign goes ACTIVE without the approvals the organisation's
 * policy demands, bound to the terms that were approved.
 *
 * Run: pnpm verify:approvals
 */
import { randomUUID } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { decide, approvalStatus, approvalGate, approvalQueue, termsHash, changedTerms, approvalRequired, effectivePolicy } = await import('../src/lib/api/approvals')
const { registerLinks } = await import('../src/lib/api/links')
const { prepareBatch, submitBatch } = await import('../src/lib/api/batches')
const { setApprovalPolicy } = await import('../src/lib/api/organizations')

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function user(tag: string) {
  return prisma.user.create({ data: { username: `${tag}-${randomUUID().slice(0, 8)}`, passwordHash: 'x', role: 'SENDER' }, select: { id: true, username: true } })
}
type Role = 'VIEWER' | 'OPERATOR' | 'APPROVER' | 'OWNER'
async function orgWith(threshold: string | null, approvalsRequired: number, members: { id: string; role: Role }[]) {
  const row = await prisma.organization.create({
    data: { name: `dc-${randomUUID().slice(0, 6)}`, approvalThreshold: threshold, approvalsRequired, memberships: { create: members.map((m) => ({ userId: m.id, role: m.role })) } },
    select: { id: true, name: true, approvalThreshold: true, approvalsRequired: true },
  })
  return { id: row.id, name: row.name, role: 'OWNER' as const, approvalThreshold: row.approvalThreshold?.toFixed() ?? null, approvalsRequired: row.approvalsRequired, screeningUrl: null, mfaPolicy: 'OFF' as const, reportingCurrency: 'USD' }
}
async function campaign(orgId: string, creator: string, amount: string, links: number) {
  // The route snapshots the organisation's policy at creation; so does this.
  const policy = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { approvalThreshold: true, approvalsRequired: true } })
  const c = await prisma.campaign.create({
    data: {
      organizationId: orgId, userId: creator, name: 'dc', network: 'testnet', senderPublicKey: Keypair.random().publicKey(),
      approvalThreshold: policy.approvalThreshold, approvalsRequired: policy.approvalsRequired,
      assetCode: 'XLM', amountPerLink: amount, linkCount: links, expiresAt: new Date(Date.now() + 86_400_000), status: 'DRAFT',
    },
    select: { id: true },
  })
  const reg = await registerLinks(c.id, orgId, Array.from({ length: links }, () => Keypair.random().publicKey()))
  if (reg.kind !== 'ok') throw new Error(`fixture: ${reg.kind}`)
  return c.id
}

async function aboveThresholdIsGated(): Promise<void> {
  console.log('\n1 & 5. Above the threshold the gate holds; below it nothing changes')
  const maker = await user('maker')
  const checker = await user('checker')
  const org = await orgWith('1000', 1, [{ id: maker.id, role: 'OWNER' }, { id: checker.id, role: 'APPROVER' }])

  const big = await campaign(org.id, maker.id, '500', 3) // 1500 ≥ 1000
  const small = await campaign(org.id, maker.id, '500', 1) // 500 < 1000

  check('a 1500 campaign needs approval', (await approvalStatus(big, org.id))?.required === true)
  check('a 500 campaign does not', (await approvalStatus(small, org.id))?.required === false)
  check('the gate refuses the big one, saying how many approvals are needed', /1 more approval/.test((await approvalGate(big)) ?? ''), `${await approvalGate(big)}`)
  // The functions the signing routes call — refused before any Horizon read.
  const prepared = await prepareBatch(big, org.id, { sequence: 1 })
  check('prepareBatch hands over no envelope', prepared.kind === 'conflict' && /approval/.test(prepared.detail), JSON.stringify(prepared))
  const submitted = await submitBatch(big, org.id, { sequence: 1, signedXdr: 'AAAA' })
  check('submitBatch refuses too', submitted.kind === 'conflict' && /approval/.test(submitted.detail), JSON.stringify(submitted))
  check('and lets the small one through', (await approvalGate(small)) === null)
  check('the queue lists only the big one', (await approvalQueue(org.id)).map((q) => q.id).join() === big)

  const approved = await decide(checker, org, big, { decision: 'APPROVED', note: 'terms look right' }, '203.0.113.1')
  check('the approver approves', approved.kind === 'ok' && approved.status.satisfied, JSON.stringify(approved))
  check('the gate now opens', (await approvalGate(big)) === null)
  check('and the queue empties', (await approvalQueue(org.id)).length === 0)

  const off = await orgWith(null, 1, [{ id: maker.id, role: 'OWNER' }])
  const any = await campaign(off.id, maker.id, '1000000', 10)
  check('with dual control off, a 10,000,000 campaign is not gated', (await approvalGate(any)) === null && (await approvalStatus(any, off.id))?.required === false)
}

async function theCreatorCannotApprove(): Promise<void> {
  console.log('\n2. The creator\'s own approval does not count, even as Owner')
  const maker = await user('owner-maker')
  const org = await orgWith('1', 1, [{ id: maker.id, role: 'OWNER' }])
  const c = await campaign(org.id, maker.id, '10', 1)
  const self = await decide(maker, org, c, { decision: 'APPROVED' }, null)
  check('refused as the creator', self.kind === 'conflict' && /created this campaign/.test(self.detail), JSON.stringify(self))
  check('the gate still holds', (await approvalGate(c)) !== null)
  check('and no approval row was written', (await prisma.campaignApproval.count({ where: { campaignId: c } })) === 0)
}

async function changedTermsInvalidate(): Promise<void> {
  console.log('\n3 & 6. Changing an approved term invalidates the approval, naming what changed')
  const maker = await user('m')
  const checker = await user('c')
  const org = await orgWith('1', 1, [{ id: maker.id, role: 'OPERATOR' }, { id: checker.id, role: 'APPROVER' }])
  const c = await campaign(org.id, maker.id, '10', 2)
  const ok = await decide(checker, org, c, { decision: 'APPROVED' }, null)
  check('approved for 2 links', ok.kind === 'ok' && ok.status.satisfied)
  check('gate open', (await approvalGate(c)) === null)

  // The classic bypass: approve small, then make it large.
  await prisma.campaign.update({ where: { id: c }, data: { linkCount: 2000 } })
  const refused = await approvalGate(c)
  check('after planting linkCount 2 → 2000 the gate refuses', refused !== null, `${refused}`)
  check('and names the changed term and the approver', /link count/.test(refused ?? '') && refused!.includes(checker.username), `${refused}`)
  const status = await approvalStatus(c, org.id)
  check('the approval shows as given for earlier terms', status?.granted === 0 && status.stale.includes(checker.username), JSON.stringify(status))

  await prisma.campaign.update({ where: { id: c }, data: { linkCount: 2, amountPerLink: '10.5' } })
  check('a changed amount is named too', /amount per link/.test((await approvalGate(c)) ?? ''), `${await approvalGate(c)}`)

  const again = await decide(checker, org, c, { decision: 'APPROVED' }, null)
  check('re-approving the new terms reopens the gate', again.kind === 'ok' && (await approvalGate(c)) === null)

  // The hash covers exactly the five terms.
  const base = { assetCode: 'XLM', assetIssuer: null, amountPerLink: '1.0', linkCount: 1, expiresAt: new Date('2027-01-01T00:00:00Z') }
  check('the hash is stable across amount spellings', termsHash(base) === termsHash({ ...base, amountPerLink: '1' }))
  check('and changes with each term', new Set([
    termsHash(base), termsHash({ ...base, assetCode: 'USDC' }), termsHash({ ...base, assetIssuer: 'G' }),
    termsHash({ ...base, amountPerLink: '2' }), termsHash({ ...base, linkCount: 2 }), termsHash({ ...base, expiresAt: new Date('2027-01-02T00:00:00Z') }),
  ]).size === 6)
  check('changedTerms names every difference', changedTerms(base, { ...base, linkCount: 5, expiresAt: new Date('2028-01-01') }).join() === 'link count,expiry')
}

async function decisionsAreAudited(): Promise<void> {
  console.log('\n4. Approval and rejection each write an audit row with approver, campaign and terms hash')
  const maker = await user('am')
  const yes = await user('ayes')
  const no = await user('ano')
  const org = await orgWith('1', 2, [{ id: maker.id, role: 'OPERATOR' }, { id: yes.id, role: 'APPROVER' }, { id: no.id, role: 'OWNER' }])
  const c = await campaign(org.id, maker.id, '5', 1)
  await decide(yes, org, c, { decision: 'APPROVED' }, '203.0.113.2')
  await decide(no, org, c, { decision: 'REJECTED', note: 'wrong asset' }, '203.0.113.3')
  const hash = (await approvalStatus(c, org.id))!.termsHash

  const rows = await prisma.auditLog.findMany({ where: { entityId: c, action: { in: ['campaign.approve', 'campaign.reject'] } }, orderBy: { createdAt: 'asc' } })
  check('two audit rows', rows.length === 2, `${rows.length}`)
  check('approve names the approver, the campaign and the terms hash', rows[0]?.action === 'campaign.approve' && rows[0].userId === yes.id && rows[0].entityId === c && (rows[0].metadata as { termsHash: string }).termsHash === hash)
  check('reject likewise, with the note', rows[1]?.action === 'campaign.reject' && rows[1].userId === no.id && (rows[1].metadata as { note: string }).note === 'wrong asset')
  check('both carry the organisation', rows.every((r) => r.organizationId === org.id))
  check('a rejection blocks signing even with an approval present', /Rejected by/.test((await approvalGate(c)) ?? ''), `${await approvalGate(c)}`)
  check('the queue shows it as rejected', (await approvalQueue(org.id))[0]?.status.rejected.length === 1)

  // Two approvals required: one is not enough.
  const second = await decide(no, org, c, { decision: 'APPROVED' }, null)
  check('changing the rejection to an approval satisfies 2-of-N', second.kind === 'ok' && second.status.granted === 2 && second.status.satisfied)
}

async function roleGateAndPolicy(): Promise<void> {
  console.log('\n· Policy: Owner sets it, value uses amount × links, threshold is inclusive')
  const owner = await user('po')
  const org = await orgWith(null, 1, [{ id: owner.id, role: 'OWNER' }])
  await setApprovalPolicy(owner.id, org, { approvalThreshold: '100', approvalsRequired: 2 }, null)
  const row = await prisma.organization.findUniqueOrThrow({ where: { id: org.id }, select: { approvalThreshold: true, approvalsRequired: true } })
  check('the policy is stored', row.approvalThreshold?.toFixed() === '100' && row.approvalsRequired === 2)
  check('and audited', (await prisma.auditLog.count({ where: { action: 'org.approval_policy', entityId: org.id } })) === 1)
  const policy = { approvalThreshold: '100', approvalsRequired: 2 }
  check('99 × 1 is below', !approvalRequired({ amountPerLink: '99', linkCount: 1 }, policy))
  check('50 × 2 is at the threshold, and gated', approvalRequired({ amountPerLink: '50', linkCount: 2 }, policy))
  check('0.0000001 × 1,000,000,000 is 100 and gated — no float in the product', approvalRequired({ amountPerLink: '0.0000001', linkCount: 1_000_000_000 }, policy))
}

/**
 * The hole the review on #62 named: an Owner who created the campaign
 * switches dual control off, signs, switches it back on. The snapshot
 * taken at creation is what the gate reads, so the switch does nothing to
 * a campaign already made — while tightening still reaches it.
 */
async function loosingThePolicyDoesNotReachExistingCampaigns(): Promise<void> {
  console.log('\n· An Owner cannot switch the gate off for a campaign already created')
  const owner = await user('sneaky')
  const org = await orgWith('100', 1, [{ id: owner.id, role: 'OWNER' }])
  const c = await campaign(org.id, owner.id, '100', 5) // 500 ≥ 100, gated; owner is the creator
  check('gated at creation', (await approvalGate(c)) !== null)

  await setApprovalPolicy(owner.id, org, { approvalThreshold: null, approvalsRequired: 1 }, null)
  check('the organisation policy is now off', (await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).approvalThreshold === null)
  const stillGated = await approvalGate(c)
  check('the existing campaign is STILL gated', stillGated !== null, `${stillGated}`)
  const prepared = await prepareBatch(c, org.id, { sequence: 1 })
  check('and prepareBatch still hands over nothing', prepared.kind === 'conflict', JSON.stringify(prepared))
  check('the owner still cannot approve it themselves', (await decide(owner, org, c, { decision: 'APPROVED' }, null)).kind === 'conflict')

  const fresh = await campaign(org.id, owner.id, '100', 5)
  check('a campaign created AFTER the loosening is not gated', (await approvalGate(fresh)) === null)

  // Tightening reaches campaigns in flight.
  await setApprovalPolicy(owner.id, org, { approvalThreshold: '10', approvalsRequired: 2 }, null)
  check('tightening the threshold gates the fresh campaign after all', (await approvalGate(fresh)) !== null)
  const status = await approvalStatus(c, org.id)
  check('and raising the count reaches the older one: 2 now needed', status?.needed === 2, JSON.stringify(status))

  const eff = effectivePolicy({ approvalThreshold: '100', approvalsRequired: 1 }, { approvalThreshold: null, approvalsRequired: 3 })
  check('effectivePolicy: the lower threshold and the higher count win', eff.approvalThreshold === '100' && eff.approvalsRequired === 3)
  const none = effectivePolicy({ approvalThreshold: null, approvalsRequired: 1 }, { approvalThreshold: null, approvalsRequired: 1 })
  check('and no threshold on either side gates nothing', !none.gatedBy(new (await import('decimal.js')).default('1e9')))
}

async function main(): Promise<void> {
  try {
    await aboveThresholdIsGated()
    await theCreatorCannotApprove()
    await changedTermsInvalidate()
    await decisionsAreAudited()
    await roleGateAndPolicy()
    await loosingThePolicyDoesNotReachExistingCampaigns()
  } finally {
    await prisma.$disconnect()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
