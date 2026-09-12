/**
 * Verification for organisations, memberships and roles (#44). Real Postgres.
 *
 * Criteria 2–7: members of one organisation see each other's campaigns
 * subject to role; a member of A cannot read or act on B's campaign by id
 * at any role; a Viewer cannot export; removing a membership ends access;
 * audit rows carry the organisation. Criterion 1 (existing behaviour
 * preserved) is every other verify script still passing on this schema.
 *
 * The scope resolver reads the session, which needs a request; it is driven
 * here through `resolveScope` on a synthetic SessionUser, and the role gate
 * through `roleAtLeast` plus the query predicates the routes use. The HTTP
 * posture (401/403/404) is exercised over HTTP in the PR transcript.
 *
 * Run: pnpm verify:organisations
 */
import { randomUUID } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { owned, roleAtLeast, resolveScope, ROLE_ORDER } = await import('../src/lib/api/session-guard')
const { listCampaigns, campaignListQuerySchema } = await import('../src/lib/api/campaign-list')
const { loadCampaignDetail } = await import('../src/lib/api/campaign-detail')
const { addMember, changeRole, removeMember, listMembers } = await import('../src/lib/api/organizations')
const { registerLinks } = await import('../src/lib/api/links')
const { queryAudit } = await import('../src/lib/api/audit')
const { createSession } = await import('../src/lib/auth/session')

let failures = 0
const check = (name: string, pass: boolean, detail = ''): void => {
  if (pass) console.log(`  PASS  ${name}`)
  else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

type Role = 'VIEWER' | 'OPERATOR' | 'APPROVER' | 'OWNER'

async function user(tag: string) {
  return prisma.user.create({ data: { username: `${tag}-${randomUUID().slice(0, 8)}`, passwordHash: 'x', role: 'SENDER' }, select: { id: true, username: true } })
}
async function org(name: string, owner: string) {
  const row = await prisma.organization.create({ data: { name, memberships: { create: { userId: owner, role: 'OWNER' } } }, select: { id: true, name: true } })
  return { id: row.id, name: row.name, role: 'OWNER' as const, approvalThreshold: null, approvalsRequired: 1 }
}
async function join(orgId: string, userId: string, role: Role) {
  await prisma.membership.create({ data: { organizationId: orgId, userId, role } })
}
async function campaign(orgId: string, creator: string, name: string) {
  return prisma.campaign.create({
    data: {
      organizationId: orgId, userId: creator, name, network: 'testnet', senderPublicKey: Keypair.random().publicKey(),
      assetCode: 'XLM', amountPerLink: '1.0000000', linkCount: 1, expiresAt: new Date(Date.now() + 86_400_000), status: 'DRAFT',
    },
    select: { id: true },
  })
}
/** What `getSessionUser` would hand the resolver for this user and session. */
const sessionUser = (u: { id: string; username: string }, sessionId: string, activeOrganizationId: string | null) =>
  ({ id: u.id, username: u.username, role: 'SENDER' as const, sessionId, activeOrganizationId })

async function membersShareCampaigns(): Promise<void> {
  console.log('\n2. Two members of one organisation see, and act on, each other\'s campaigns')
  const alice = await user('alice')
  const bob = await user('bob')
  const acme = await org('Acme', alice.id)
  await join(acme.id, bob.id, 'OPERATOR')
  const c = await campaign(acme.id, alice.id, 'alice made this')

  const bobSees = await loadCampaignDetail(c.id, acme.id)
  check("bob (Operator) loads alice's campaign through the organisation", bobSees?.campaign.id === c.id)
  const listed = await listCampaigns(acme.id, campaignListQuerySchema.parse({}))
  check('and it is on the organisation\'s list', listed.rows.some((r) => r.id === c.id))
  const registered = await registerLinks(c.id, acme.id, [Keypair.random().publicKey()])
  check('and bob can register links on it (an Operator action, scoped by org)', registered.kind === 'ok', JSON.stringify(registered))
}

async function crossOrgIsInvisibleAtEveryRole(): Promise<void> {
  console.log('\n3 & 7. A member of A cannot read or act on B\'s campaign by id, at any role')
  const owner = await user('owner')
  const other = await org('Other Ltd', owner.id)
  const secret = await campaign(other.id, owner.id, 'other org campaign')

  for (const role of ROLE_ORDER) {
    const mallory = await user(`mallory-${role.toLowerCase()}`)
    const mine = await org(`Mallory ${role}`, mallory.id)
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: mine.id, userId: mallory.id } }, data: { role } })
    // The predicate every campaign route runs, with the caller's own scope.
    const byId = await prisma.campaign.findFirst({ where: owned(secret.id, mine.id), select: { id: true } })
    const detail = await loadCampaignDetail(secret.id, mine.id)
    const listed = await listCampaigns(mine.id, campaignListQuerySchema.parse({ q: 'other' }))
    const write = await registerLinks(secret.id, mine.id, [Keypair.random().publicKey()])
    check(`${role}: B's campaign is absent by id, by detail, by search, and refused on write`,
      byId === null && detail === null && listed.total === 0 && write.kind === 'not-found',
      JSON.stringify({ byId, detail: detail !== null, listed: listed.total, write: write.kind }))
  }
}

function rolesAreOrdered(): void {
  console.log('\n4. Role order, as the export and mutation gates read it')
  check('Viewer is below Operator', !roleAtLeast('VIEWER', 'OPERATOR'))
  check('Operator, Approver and Owner clear the Operator gate', roleAtLeast('OPERATOR', 'OPERATOR') && roleAtLeast('APPROVER', 'OPERATOR') && roleAtLeast('OWNER', 'OPERATOR'))
  check('only Owner clears the Owner gate', roleAtLeast('OWNER', 'OWNER') && !roleAtLeast('APPROVER', 'OWNER'))
  // The export route calls requireUser('OPERATOR'); the HTTP transcript shows a Viewer getting 403 from it.
}

async function removingAMembershipEndsAccess(): Promise<void> {
  console.log('\n5. Removing a membership ends access, live session included')
  const owner = await user('own')
  const carol = await user('carol')
  const team = await org('Team', owner.id)
  await join(team.id, carol.id, 'VIEWER')
  const { token } = await createSession(carol.id, {})
  const session = await prisma.session.findFirstOrThrow({ where: { userId: carol.id }, select: { id: true } })
  await prisma.session.update({ where: { id: session.id }, data: { activeOrganizationId: team.id } })
  void token

  const before = await resolveScope(sessionUser(carol, session.id, team.id))
  check('before: her live session resolves to Team as a Viewer', before?.id === team.id && before.role === 'VIEWER', JSON.stringify(before))

  const removed = await removeMember(owner.id, team, carol.id, null)
  check('the owner removes her', removed.kind === 'ok', JSON.stringify(removed))
  const after = await resolveScope(sessionUser(carol, session.id, team.id))
  check('after: the same session resolves to no organisation', after === null, JSON.stringify(after))
  const cleared = await prisma.session.findUniqueOrThrow({ where: { id: session.id }, select: { activeOrganizationId: true } })
  check('and the session no longer names Team', cleared.activeOrganizationId === null)

  const lastOwner = await removeMember(owner.id, team, owner.id, null)
  check('the last owner cannot be removed', lastOwner.kind === 'conflict', JSON.stringify(lastOwner))
  const demote = await changeRole(owner.id, team, owner.id, 'VIEWER', null)
  check('nor demoted', demote.kind === 'conflict', JSON.stringify(demote))

  /*
   * Two owners acting on EACH OTHER at the same moment. A count-then-write
   * would let both see two owners and leave none; the serializable
   * transaction lets exactly one through, and the loser gets the same
   * refusal as a plain last-owner attempt.
   */
  for (const [label, act] of [
    ['demote', (o: Awaited<ReturnType<typeof org>>, actor: string, target: string) => changeRole(actor, o, target, 'VIEWER', null)],
    ['remove', (o: Awaited<ReturnType<typeof org>>, actor: string, target: string) => removeMember(actor, o, target, null)],
  ] as const) {
    for (let round = 0; round < 4; round += 1) {
      const a = await user(`ownA-${label}`)
      const b = await user(`ownB-${label}`)
      const pair = await org(`Pair ${label} ${round}`, a.id)
      await join(pair.id, b.id, 'OWNER')
      const results = await Promise.all([act(pair, a.id, b.id), act(pair, b.id, a.id)])
      const owners = await prisma.membership.count({ where: { organizationId: pair.id, role: 'OWNER' } })
      check(`two owners ${label} each other at once, round ${round}: one wins, one is refused, one owner remains`,
        results.filter((r) => r.kind === 'ok').length === 1 && results.filter((r) => r.kind === 'conflict').length === 1 && owners === 1,
        JSON.stringify({ results: results.map((r) => r.kind), owners }))
    }
  }
}

async function auditRowsCarryTheOrganisation(): Promise<void> {
  console.log('\n6. Audit rows carry the organisation and can be filtered by it')
  const owner = await user('aud')
  const dave = await user('dave')
  const acme = await org('Audited', owner.id)
  const added = await addMember(owner.id, acme, { username: dave.username, role: 'OPERATOR' }, '203.0.113.9')
  check('an existing account joins without an invitation', added.kind === 'ok' && !added.inviteUrl, JSON.stringify(added))
  const invited = await addMember(owner.id, acme, { username: `new-${randomUUID().slice(0, 8)}`, role: 'VIEWER' }, null)
  check('an unknown username is invited, with a URL returned once', invited.kind === 'ok' && !!invited.inviteUrl, JSON.stringify(invited))
  const members = await listMembers(acme.id)
  check('the member list shows owner, dave and the invitee', members.length === 3 && members.some((m) => m.invited), JSON.stringify(members.map((m) => [m.username, m.role, m.invited])))

  const page = await queryAudit({ organizationId: acme.id })
  check('the audit log answers "what happened in my organisation"', page.total === 2 && page.rows.every((r) => r.organization === 'Audited'), JSON.stringify(page.rows.map((r) => r.action)))
  const elsewhere = await queryAudit({ organizationId: 'org_nobody' })
  check('and nothing for an organisation with no history', elsewhere.total === 0)
}

async function main(): Promise<void> {
  try {
    await membersShareCampaigns()
    await crossOrgIsInvisibleAtEveryRole()
    rolesAreOrdered()
    await removingAMembershipEndsAccess()
    await auditRowsCarryTheOrganisation()
  } finally {
    await prisma.$disconnect()
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
