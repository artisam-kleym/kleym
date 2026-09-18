/**
 * Campaign templates and schedules (#82), verified against a real database.
 *
 * A due schedule prepares exactly one DRAFT campaign with the template's
 * terms and list and moves its pointer once — a second pass in the same hour
 * prepares nothing; the draft has no links and nothing funded; a template
 * from a campaign carries its terms and its links' labels; disabling stops
 * runs and leaves past ones; a run above the threshold is in the approval
 * queue on its own hash; a run's campaign is scoped to the organisation.
 *
 *   pnpm verify:templates   (needs Postgres)
 */
import { randomUUID } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { applyEnvPlaceholders } from '../tests/env-placeholders'
import { personalOrg } from '../tests/fixtures/tenant'

applyEnvPlaceholders()

const { prisma } = await import('../src/lib/db/client')
const { createTemplate, loadTemplate, prepareRun, runDueTemplates, runHistory, templateFromCampaign, updateTemplate, prefillFromDraft } = await import('../src/lib/api/templates')
const { approvalQueue } = await import('../src/lib/api/approvals')

let failures = 0
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failures += 1
}

async function tenant() {
  const user = await prisma.user.create({ data: { username: `tpl-${randomUUID()}`, passwordHash: 'x', role: 'SENDER' }, select: { id: true } })
  const organizationId = await personalOrg(prisma, user.id)
  const org = { id: organizationId, name: 'tpl', role: 'OWNER' as const, approvalThreshold: null, approvalsRequired: 1, screeningUrl: null, mfaPolicy: 'OFF' as const }
  return { userId: user.id, org }
}

async function main(): Promise<void> {
  const t = await tenant()
  const actor = { userId: t.userId, org: t.org, ip: null }
  const sender = Keypair.random().publicKey()

  console.log('\n1. A template from a campaign carries its terms and its links')
  const source = await prisma.campaign.create({
    data: {
      userId: t.userId, organizationId: t.org.id, name: 'March contractors', network: 'testnet', senderPublicKey: sender, assetCode: 'XLM', amountPerLink: '100',
      linkCount: 2, expiresAt: new Date(Date.now() + 30 * 86_400_000), status: 'ACTIVE', claimPolicy: 'EMAIL', reminderDaysBefore: [7, 1],
      links: { create: [{ ephemeralPublicKey: Keypair.random().publicKey(), amount: '100', label: 'alice', reference: 'INV-1' }, { ephemeralPublicKey: Keypair.random().publicKey(), amount: '100', label: 'bob' }] },
    },
    select: { id: true },
  })
  const from = await templateFromCampaign(source.id, t.org.id)
  check('terms copied: asset, amount, policy, reminders, expiry offset', from?.terms.assetCode === 'XLM' && from?.terms.amountPerLink === '100' && from?.terms.claimPolicy === 'email' && from?.terms.reminderDaysBefore?.join() === '7,1' && from?.terms.expiryDays === 30, JSON.stringify(from?.terms))
  check('the links became the recipient list', from?.recipientsCsv.includes('alice') === true && from?.recipientsCsv.includes('INV-1') === true)

  console.log('\n2. A schedule prepares exactly one draft per due instant')
  const created = await createTemplate(actor, { name: 'Monthly', terms: from!.terms, recipientsCsv: from!.recipientsCsv, cadence: 'monthly:1', runHour: 9, enabled: true }, 1000)
  if (created.kind !== 'ok') throw new Error('template not created')
  // Make it due.
  await prisma.campaignTemplate.update({ where: { id: created.value.id }, data: { nextRunAt: new Date(Date.now() - 60_000) } })
  const first = await runDueTemplates(new Date(), 1000)
  const second = await runDueTemplates(new Date(), 1000)
  check('one run prepared on the first pass', first.prepared === 1, JSON.stringify(first))
  check('none on the second — the pointer moved', second.prepared === 0 && second.checked === 0, JSON.stringify(second))
  const runs = await runHistory(created.value.id, t.org.id)
  check('the run is in the history as scheduled', runs.length === 1 && runs[0]!.kind === 'SCHEDULED')
  const draft = await prisma.campaign.findUniqueOrThrow({ where: { id: runs[0]!.campaign!.id }, select: { status: true, linkCount: true, amountPerLink: true, templateId: true, _count: { select: { links: true, batches: true } } } })
  check('the campaign is a DRAFT with the terms, no links and no batches', draft.status === 'DRAFT' && draft.linkCount === 2 && draft.amountPerLink.toFixed() === '100' && draft._count.links === 0 && draft._count.batches === 0 && draft.templateId === created.value.id)
  const prefill = await prefillFromDraft(runs[0]!.campaign!.id, t.org.id, 1000)
  check('the wizard can continue it with the list', prefill?.draftCampaignId === runs[0]!.campaign!.id && prefill?.recipientsCsv.includes('alice') === true)
  const other = await tenant()
  check("another organisation cannot", (await prefillFromDraft(runs[0]!.campaign!.id, other.org.id, 1000)) === null)

  console.log('\n3. Approval binds to the run, not the template')
  await prisma.organization.update({ where: { id: t.org.id }, data: { approvalThreshold: '150', approvalsRequired: 1 } })
  const manual = await prepareRun((await loadTemplate(created.value.id, t.org.id))!, 'MANUAL', new Date(), 1000, { userId: t.userId, ip: null })
  check('a run above the threshold says so', manual.kind === 'ok' && manual.value.approvalRequired === true)
  const queue = await approvalQueue(t.org.id)
  check('and is in the approval queue on its own campaign', manual.kind === 'ok' && queue.some((c) => c.id === manual.value.campaignId))

  console.log('\n3b. A pushed list does not move the schedule; a failed run is recorded with why')
  const before = (await loadTemplate(created.value.id, t.org.id))!.nextRunAt
  await updateTemplate(actor, created.value.id, { recipientsCsv: 'label\ncarol\n' }, 1000)
  check('nextRunAt unchanged after a recipients-only PATCH', (await loadTemplate(created.value.id, t.org.id))!.nextRunAt?.getTime() === before?.getTime())
  await updateTemplate(actor, created.value.id, { recipientsCsv: '' }, 1000)
  await prisma.campaignTemplate.update({ where: { id: created.value.id }, data: { nextRunAt: new Date(Date.now() - 60_000) } })
  const emptyPass = await runDueTemplates(new Date(), 1000)
  const history = await runHistory(created.value.id, t.org.id)
  check('an empty list is a FAILED run in the history, with the reason', emptyPass.failed === 1 && history[0]!.status === 'FAILED' && history[0]!.campaign === null && /no recipients/.test(history[0]!.failure ?? ''))
  check('the prepared run kept the list it was prepared with', (await prisma.templateRun.findFirst({ where: { templateId: created.value.id, status: 'PREPARED' }, select: { recipientsCsv: true } }))!.recipientsCsv.includes('alice'))
  await updateTemplate(actor, created.value.id, { recipientsCsv: from!.recipientsCsv }, 1000)

  console.log('\n4. Disabling stops future runs and leaves past ones')
  const disabled = await updateTemplate(actor, created.value.id, { enabled: false }, 1000)
  check('nextRunAt cleared', disabled.kind === 'ok' && disabled.value.nextRunAt === null)
  await prisma.campaignTemplate.update({ where: { id: created.value.id }, data: { nextRunAt: new Date(Date.now() - 60_000) } })
  check('a disabled template is not run even when a stale pointer says due', (await runDueTemplates(new Date(), 1000)).prepared === 0)
  check('past runs are untouched', (await runHistory(created.value.id, t.org.id)).length === 3)

  await prisma.$disconnect()
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
