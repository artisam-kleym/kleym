/**
 * Campaign templates and recurring schedules (#82).
 *
 * A template is a campaign's TERMS — asset, amount, expiry as an offset,
 * claim policy, delivery options — plus the recipient list, so the next
 * monthly run starts with only keys missing. A schedule prepares a run on a
 * cadence: it creates the campaign in DRAFT with the terms and list resolved
 * and tells the operator it is ready to review, export and sign.
 *
 * **A schedule prepares; a human still signs.** Keys are generated in the
 * browser and batches are signed by the sender's wallet, so nothing here can
 * create AND fund a campaign. That is not a limitation to engineer around —
 * it is AGENT.md §1 working. The cadence automates the preparation and the
 * reminder, never the disbursement.
 *
 * Dual control (#45) is untouched by templates: a run is an ordinary DRAFT
 * campaign whose terms hash is its OWN — amount, count, expiry, asset — so a
 * run above the threshold enters the approval queue by construction, and an
 * approval of one run says nothing about the next. A template is never a
 * way around the threshold.
 */
import { z } from 'zod'
import Decimal from 'decimal.js'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { parseLabels } from '@/lib/campaign/csv'
import { emitWebhook } from '@/lib/webhooks/emit'
import { recordAudit } from './audit'
import { approvalRequired, campaignValue, effectivePolicy } from './approvals'
import { campaignBodySchema, createCampaign, createCampaignSchema, serialiseAmount, zodErrors } from './campaigns'
import { owned, type OrgScope } from './session-guard'
import { seedFreeString } from '@/lib/validation/stellar'

/** The terms a template holds: the campaign body minus name, count and the absolute expiry. */
export const templateTermsSchema = campaignBodySchema
  .omit({ name: true, linkCount: true, expiresAt: true, derivationIndex: true, keyFingerprint: true, templateId: true })
  .extend({
    /** Days from the run to expiry. The wizard's default is 30. */
    expiryDays: z.number().int().min(1).max(365),
  })
  .strict()

export type TemplateTerms = z.infer<typeof templateTermsSchema>

/** `daily`, `weekly:<0-6>` (0 = Sunday), `monthly:<1-28>`. 29–31 are refused: a run that skips months is a surprise. */
export const cadenceSchema = z.string().regex(/^(daily|weekly:[0-6]|monthly:([1-9]|1\d|2[0-8]))$/, 'daily, weekly:<0-6> or monthly:<1-28>')

export const templateSchema = z
  .object({
    name: seedFreeString.min(1).max(120),
    terms: templateTermsSchema,
    /** The wizard's recipient CSV: label, and optionally amount, reference, category, note. */
    recipientsCsv: seedFreeString.max(2_000_000).default(''),
    cadence: cadenceSchema.nullable().default(null),
    runHour: z.number().int().min(0).max(23).default(9),
    enabled: z.boolean().default(true),
  })
  .strict()

export type TemplateInput = z.infer<typeof templateSchema>

/**
 * The terms as the campaign schema would judge them (issuer for a credit
 * asset, none for XLM, receive-as differs from the asset…), checked when a
 * template is SAVED with a synthetic body, so a run cannot be the first
 * thing to find out. The same errors the wizard would show.
 */
export function refusedTerms(terms: TemplateTerms): { path: string; message: string }[] | null {
  const { expiryDays, ...body } = terms
  const parsed = createCampaignSchema.safeParse({ ...body, name: 'x', linkCount: 1, expiresAt: new Date(Date.now() + expiryDays * 86_400_000).toISOString() })
  return parsed.success ? null : zodErrors(parsed.error)
}

/** Partial update: any subset of the same fields. */
export const templatePatchSchema = templateSchema.partial().strict()

export interface Recipients {
  labels: string[]
  attestations?: ({ reference: string | null; category: string | null; note: string | null } | null)[]
  amounts?: (string | null)[]
}

/** The recipient list a template holds, parsed as the wizard parses it; refused with the same reasons. */
export function parseRecipients(csv: string, allowed: number): { ok: true; recipients: Recipients } | { ok: false; detail: string } {
  if (csv.trim() === '') return { ok: true, recipients: { labels: [] } }
  const parsed = parseLabels(csv, allowed)
  if (!parsed.ok) {
    const detail = {
      empty: 'The recipient list is empty.',
      address: `Line ${'line' in parsed ? parsed.line : '?'} looks like a Stellar address; the list takes labels, not keys.`,
      seed: `Line ${'line' in parsed ? parsed.line : '?'} looks like a secret seed. Nothing was saved.`,
      amount: `Line ${'line' in parsed ? parsed.line : '?'} has an amount that is not a valid Stellar amount.`,
      'too-many': `The list has ${'found' in parsed ? parsed.found : '?'} rows; at most ${allowed} are allowed.`,
      'too-long': `Line ${'line' in parsed ? parsed.line : '?'} has a field over its limit.`,
    }[parsed.reason]
    return { ok: false, detail }
  }
  return { ok: true, recipients: { labels: parsed.labels, attestations: parsed.attestations, amounts: parsed.amounts } }
}

/** SUM of what the links would pay: each own amount, or the default. Decimal (AGENT.md §4.1). */
export function runTotal(terms: Pick<TemplateTerms, 'amountPerLink'>, recipients: Recipients): Decimal {
  const fallback = new Decimal(terms.amountPerLink)
  return recipients.labels.reduce((sum, _, i) => sum.plus(recipients.amounts?.[i] ? new Decimal(recipients.amounts[i]!) : fallback), new Decimal(0))
}

/**
 * The next instant a cadence fires at or after `after`, at `runHour` UTC.
 * Pure, so the schedule is testable without a clock.
 */
export function nextRun(cadence: string, runHour: number, after: Date): Date {
  const at = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), runHour, 0, 0, 0))
  const [kind, arg] = cadence.split(':') as [string, string | undefined]
  const n = Number(arg ?? 0)
  let candidate = at(after)
  for (let i = 0; i < 400; i += 1) {
    const matches =
      kind === 'daily' ||
      (kind === 'weekly' && candidate.getUTCDay() === n) ||
      (kind === 'monthly' && candidate.getUTCDate() === n)
    if (matches && candidate.getTime() > after.getTime()) return candidate
    candidate = new Date(candidate.getTime() + 86_400_000)
  }
  throw new Error(`no next run for cadence ${cadence}`)
}

const TEMPLATE_SELECT = {
  id: true, organizationId: true, createdById: true, name: true, enabled: true, terms: true, recipientsCsv: true,
  cadence: true, runHour: true, nextRunAt: true, lastRunAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.CampaignTemplateSelect

export type TemplateRow = Prisma.CampaignTemplateGetPayload<{ select: typeof TEMPLATE_SELECT }>

export type TemplateOutcome<T> = { kind: 'ok'; value: T } | { kind: 'not-found' } | { kind: 'invalid'; detail: string; errors?: { path: string; message: string }[] }

function termsOf(row: { terms: unknown }): TemplateTerms {
  return templateTermsSchema.parse(row.terms)
}

export async function listTemplates(organizationId: string): Promise<TemplateRow[]> {
  return prisma.campaignTemplate.findMany({ where: { organizationId }, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: TEMPLATE_SELECT })
}

export async function loadTemplate(id: string, organizationId: string): Promise<TemplateRow | null> {
  return prisma.campaignTemplate.findFirst({ where: { id, organizationId }, select: TEMPLATE_SELECT })
}

export async function createTemplate(
  actor: { userId: string; org: OrgScope; ip: string | null },
  input: TemplateInput,
  maxLinks: number,
): Promise<TemplateOutcome<TemplateRow>> {
  const recipients = parseRecipients(input.recipientsCsv, maxLinks)
  if (!recipients.ok) return { kind: 'invalid', detail: recipients.detail }
  const refused = refusedTerms(input.terms)
  if (refused) return { kind: 'invalid', detail: refused.map((e) => `${e.path}: ${e.message}`).join('; '), errors: refused }
  const now = new Date()
  const row = await prisma.campaignTemplate.create({
    data: {
      organizationId: actor.org.id, createdById: actor.userId, name: input.name, enabled: input.enabled,
      terms: input.terms, recipientsCsv: input.recipientsCsv, cadence: input.cadence, runHour: input.runHour,
      nextRunAt: input.cadence && input.enabled ? nextRun(input.cadence, input.runHour, now) : null,
    },
    select: TEMPLATE_SELECT,
  })
  await recordAudit({
    userId: actor.userId, organizationId: actor.org.id, action: 'template.create', entityType: 'template', entityId: row.id,
    metadata: { name: row.name, cadence: row.cadence, recipients: recipients.recipients.labels.length }, ip: actor.ip,
  })
  return { kind: 'ok', value: row }
}

export async function updateTemplate(
  actor: { userId: string; org: OrgScope; ip: string | null },
  id: string,
  patch: z.infer<typeof templatePatchSchema>,
  maxLinks: number,
): Promise<TemplateOutcome<TemplateRow>> {
  const existing = await loadTemplate(id, actor.org.id)
  if (!existing) return { kind: 'not-found' }
  if (patch.recipientsCsv !== undefined) {
    const recipients = parseRecipients(patch.recipientsCsv, maxLinks)
    if (!recipients.ok) return { kind: 'invalid', detail: recipients.detail }
  }
  if (patch.terms !== undefined) {
    const refused = refusedTerms(patch.terms)
    if (refused) return { kind: 'invalid', detail: refused.map((e) => `${e.path}: ${e.message}`).join('; '), errors: refused }
  }
  const cadence = patch.cadence === undefined ? existing.cadence : patch.cadence
  const runHour = patch.runHour ?? existing.runHour
  const enabled = patch.enabled ?? existing.enabled
  // The pointer moves only when the SCHEDULE changes. A list pushed at 09:03
  // for a 09:00 run must not push that run to the next period.
  const scheduleChanged = cadence !== existing.cadence || runHour !== existing.runHour || enabled !== existing.enabled
  const row = await prisma.campaignTemplate.update({
    where: { id: existing.id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.terms !== undefined ? { terms: patch.terms } : {}),
      ...(patch.recipientsCsv !== undefined ? { recipientsCsv: patch.recipientsCsv } : {}),
      cadence, runHour, enabled,
      // Disabling stops future runs and leaves past ones untouched: only the pointer moves.
      ...(scheduleChanged ? { nextRunAt: cadence && enabled ? nextRun(cadence, runHour, new Date()) : null } : {}),
    },
    select: TEMPLATE_SELECT,
  })
  await recordAudit({
    userId: actor.userId, organizationId: actor.org.id, action: 'template.update', entityType: 'template', entityId: row.id,
    metadata: { fields: Object.keys(patch).join(','), enabled: row.enabled, cadence: row.cadence }, ip: actor.ip,
  })
  return { kind: 'ok', value: row }
}

export async function deleteTemplate(actor: { userId: string; org: OrgScope; ip: string | null }, id: string): Promise<TemplateOutcome<null>> {
  const existing = await loadTemplate(id, actor.org.id)
  if (!existing) return { kind: 'not-found' }
  // Past runs keep their campaigns: the campaign's templateId is set null by the relation.
  await prisma.campaignTemplate.delete({ where: { id: existing.id } })
  await recordAudit({ userId: actor.userId, organizationId: actor.org.id, action: 'template.delete', entityType: 'template', entityId: existing.id, metadata: { name: existing.name }, ip: actor.ip })
  return { kind: 'ok', value: null }
}

/** A template from a campaign that exists: its terms, and its links' labels/amounts/attestations as the CSV. */
export async function templateFromCampaign(campaignId: string, organizationId: string): Promise<{ name: string; terms: TemplateTerms; recipientsCsv: string } | null> {
  const campaign = await prisma.campaign.findFirst({
    where: owned(campaignId, organizationId),
    select: {
      name: true, network: true, senderPublicKey: true, assetCode: true, assetIssuer: true, amountPerLink: true, expiresAt: true, createdAt: true,
      claimPolicy: true, reminderDaysBefore: true, receiveAsAssets: true, allowExchangeDeposit: true, variableAmounts: true,
      links: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { label: true, amount: true, reference: true, category: true, note: true } },
    },
  })
  if (!campaign) return null
  const days = Math.max(1, Math.min(365, Math.round((campaign.expiresAt.getTime() - campaign.createdAt.getTime()) / 86_400_000)))
  const terms: TemplateTerms = {
    network: campaign.network === 'public' ? 'public' : 'testnet',
    senderPublicKey: campaign.senderPublicKey,
    assetCode: campaign.assetCode,
    ...(campaign.assetIssuer ? { assetIssuer: campaign.assetIssuer } : {}),
    amountPerLink: serialiseAmount(campaign.amountPerLink),
    expiryDays: days,
    ...(campaign.claimPolicy !== 'OPEN' ? { claimPolicy: campaign.claimPolicy.toLowerCase() as 'code' | 'email' | 'passkey' } : {}),
    ...(campaign.reminderDaysBefore.length > 0 ? { reminderDaysBefore: campaign.reminderDaysBefore } : {}),
    ...(campaign.receiveAsAssets.length > 0
      ? { receiveAs: campaign.receiveAsAssets.map((ref) => (ref === 'XLM' ? { assetCode: 'XLM' } : { assetCode: ref.split(':')[0]!, assetIssuer: ref.split(':')[1]! })) }
      : {}),
    ...(campaign.allowExchangeDeposit ? { allowExchangeDeposit: true } : {}),
  }
  const cell = (v: string | null) => {
    const t = v ?? ''
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const lines = ['label,amount,reference,category,note']
  for (const l of campaign.links) {
    lines.push([cell(l.label), campaign.variableAmounts ? serialiseAmount(l.amount) : '', cell(l.reference), cell(l.category), cell(l.note)].join(','))
  }
  return { name: campaign.name, terms, recipientsCsv: campaign.links.length > 0 ? lines.join('\n') + '\n' : '' }
}

/* ── Runs ───────────────────────────────────────────────────────────────── */

export interface RunResult {
  campaignId: string
  linkCount: number
  totalAmount: string
  approvalRequired: boolean
}

/**
 * Prepares one run: a DRAFT campaign with the template's terms and the
 * recipient list AS OF NOW (stored with the run, so the draft is continued
 * with the list its link count was fixed for). Expiry is dated from now, not
 * from the scheduled instant — a run caught up after an outage is not
 * shortened, nor lost. Never funds, never signs. The campaign's own terms
 * hash is what any approval binds to.
 *
 * The run row is what makes the draft visible; if it cannot be written the
 * draft is deleted again, so a failure between the two leaves no orphan.
 */
export async function prepareRun(
  template: TemplateRow,
  kind: 'SCHEDULED' | 'MANUAL',
  scheduledFor: Date,
  maxLinks: number,
  actor: { userId: string; ip: string | null },
  now: Date = new Date(),
): Promise<TemplateOutcome<RunResult>> {
  const terms = termsOf(template)
  const recipients = parseRecipients(template.recipientsCsv, maxLinks)
  if (!recipients.ok) return { kind: 'invalid', detail: recipients.detail }
  if (recipients.recipients.labels.length === 0) return { kind: 'invalid', detail: 'The template has no recipients; add a list before running it.' }
  const { expiryDays, ...body } = terms
  const input = createCampaignSchema.safeParse({
    ...body,
    name: `${template.name} — ${now.toISOString().slice(0, 10)}`,
    linkCount: recipients.recipients.labels.length,
    expiresAt: new Date(now.getTime() + expiryDays * 86_400_000).toISOString(),
  })
  if (!input.success) return { kind: 'invalid', detail: zodErrors(input.error).map((e) => `${e.path}: ${e.message}`).join('; '), errors: zodErrors(input.error) }

  const campaign = await createCampaign({ userId: actor.userId, organizationId: template.organizationId }, input.data, actor.ip)
  try {
    await prisma.$transaction([
      prisma.campaign.update({ where: { id: campaign.id }, data: { templateId: template.id } }),
      prisma.templateRun.create({ data: { templateId: template.id, campaignId: campaign.id, kind, status: 'PREPARED', scheduledFor, recipientsCsv: template.recipientsCsv } }),
    ])
  } catch (error) {
    // No run row means no way to see or continue the draft: remove it rather than leave an orphan.
    await prisma.campaign.delete({ where: { id: campaign.id } }).catch(() => undefined)
    throw error
  }
  const total = runTotal(terms, recipients.recipients)
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: template.organizationId }, select: { approvalThreshold: true, approvalsRequired: true } })
  const policy = effectivePolicy(
    { approvalThreshold: org.approvalThreshold, approvalsRequired: org.approvalsRequired },
    { approvalThreshold: org.approvalThreshold, approvalsRequired: org.approvalsRequired },
  )
  const needsApproval = approvalRequired({ amountPerLink: terms.amountPerLink, linkCount: input.data.linkCount, totalAmount: total.toFixed() }, policy)
  await recordAudit({
    userId: actor.userId, organizationId: template.organizationId, action: 'template.run', entityType: 'template', entityId: template.id,
    metadata: { campaignId: campaign.id, kind, scheduledFor: scheduledFor.toISOString(), linkCount: input.data.linkCount, totalAmount: total.toFixed() }, ip: actor.ip,
  })
  logger.info({ templateId: template.id, campaignId: campaign.id, kind, linkCount: input.data.linkCount }, 'template run prepared')
  return { kind: 'ok', value: { campaignId: campaign.id, linkCount: input.data.linkCount, totalAmount: total.toFixed(), approvalRequired: needsApproval } }
}

export const RUN_PASS_LIMIT = 50

/** A run that prepared nothing is still a run: recorded FAILED with the reason, announced, and shown in the history. */
async function recordFailedRun(template: TemplateRow, scheduledFor: Date, reason: string): Promise<void> {
  await prisma.templateRun.create({ data: { templateId: template.id, campaignId: null, kind: 'SCHEDULED', status: 'FAILED', failure: reason, scheduledFor, recipientsCsv: template.recipientsCsv } })
  await emitWebhook(template.organizationId, 'template.run_failed', { templateId: template.id, templateName: template.name, scheduledFor: scheduledFor.toISOString(), reason })
  logger.warn({ templateId: template.id, reason }, 'scheduled template run could not be prepared')
}

/**
 * The hourly pass: every enabled template whose next run is due gets ONE
 * run, and its pointer moves past now before anything else — so a crash
 * mid-pass cannot prepare the same run twice, and a template that was down
 * for a week gets one run, not seven. The operator is told by webhook and
 * on the dashboard; nothing is signed. A run that cannot be prepared is
 * recorded as FAILED with why, since the schedule has already moved on.
 */
export async function runDueTemplates(now: Date = new Date(), maxLinks: number, limit = RUN_PASS_LIMIT): Promise<{ checked: number; prepared: number; failed: number }> {
  const due = await prisma.campaignTemplate.findMany({
    where: { enabled: true, cadence: { not: null }, nextRunAt: { lte: now } },
    orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
    take: limit,
    select: TEMPLATE_SELECT,
  })
  let prepared = 0
  let failed = 0
  for (const template of due) {
    const scheduledFor = template.nextRunAt!
    // Claim the run first: one writer per due instant.
    const claimed = await prisma.campaignTemplate.updateMany({
      where: { id: template.id, nextRunAt: scheduledFor },
      data: { nextRunAt: nextRun(template.cadence!, template.runHour, now), lastRunAt: now },
    })
    if (claimed.count === 0) continue
    try {
      const outcome = await prepareRun(template, 'SCHEDULED', scheduledFor, maxLinks, { userId: template.createdById, ip: null }, now)
      if (outcome.kind !== 'ok') {
        failed += 1
        await recordFailedRun(template, scheduledFor, outcome.kind === 'invalid' ? outcome.detail : 'The template could not be found.')
        continue
      }
      const terms = termsOf(template)
      await emitWebhook(template.organizationId, 'template.run_prepared', {
        templateId: template.id, templateName: template.name, campaignId: outcome.value.campaignId, scheduledFor: scheduledFor.toISOString(),
        linkCount: outcome.value.linkCount, amountPerLink: new Decimal(terms.amountPerLink).toFixed(), assetCode: terms.assetCode,
        totalAmount: outcome.value.totalAmount, approvalRequired: outcome.value.approvalRequired,
      })
      prepared += 1
    } catch (error) {
      failed += 1
      const reason = error instanceof Error ? error.message : 'unknown'
      await recordFailedRun(template, scheduledFor, `The run failed before a campaign was created: ${reason}`).catch((again: unknown) =>
        logger.error({ templateId: template.id, reason: again instanceof Error ? again.message : 'unknown' }, 'failed run could not be recorded'),
      )
    }
  }
  return { checked: due.length, prepared, failed }
}

/** Every run of this template, newest first — prepared ones with their campaign's status and value, failed ones with why. */
export async function runHistory(templateId: string, organizationId: string) {
  const runs = await prisma.templateRun.findMany({
    where: { templateId, template: { organizationId } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true, kind: true, status: true, failure: true, scheduledFor: true, createdAt: true,
      campaign: { select: { id: true, name: true, status: true, assetCode: true, amountPerLink: true, linkCount: true, expiresAt: true, _count: { select: { links: { where: { status: 'CLAIMED' } } } } } },
    },
  })
  const campaignIds = runs.flatMap((r) => (r.campaign ? [r.campaign.id] : []))
  const totals = await prisma.claimLink.groupBy({ by: ['campaignId'], where: { campaignId: { in: campaignIds } }, _sum: { amount: true } })
  const sums = new Map(totals.map((t) => [t.campaignId, t._sum.amount]))
  return runs.map((r) => ({
    id: r.id, kind: r.kind, status: r.status, failure: r.failure, scheduledFor: r.scheduledFor, createdAt: r.createdAt,
    campaign: r.campaign
      ? {
          id: r.campaign.id, name: r.campaign.name, status: r.campaign.status, assetCode: r.campaign.assetCode, linkCount: r.campaign.linkCount,
          claimed: r.campaign._count.links, expiresAt: r.campaign.expiresAt,
          // Registered links' own amounts when they exist; the uniform figure until they do.
          total: campaignValue({ amountPerLink: r.campaign.amountPerLink, linkCount: r.campaign.linkCount, totalAmount: sums.get(r.campaign.id)?.toString() ?? null }).toFixed(),
        }
      : null,
  }))
}

/** Prepared runs still waiting for keys — what the dashboard shows an operator. */
export async function pendingRuns(organizationId: string) {
  const runs = await prisma.templateRun.findMany({
    where: { template: { organizationId }, status: 'PREPARED', campaign: { status: 'DRAFT' } },
    orderBy: [{ scheduledFor: 'desc' }],
    take: 10,
    select: { id: true, kind: true, scheduledFor: true, template: { select: { id: true, name: true } }, campaign: { select: { id: true, name: true, linkCount: true, amountPerLink: true, assetCode: true } } },
  })
  return runs.flatMap((r) => (r.campaign ? [{ ...r, campaign: r.campaign }] : []))
}

/* ── Wizard prefill ─────────────────────────────────────────────────────── */

export interface TemplatePrefill {
  templateId: string
  templateName: string
  draftCampaignId: string | null
  name: string
  network: 'testnet' | 'public'
  senderPublicKey: string
  assetCode: string
  assetIssuer: string | null
  amountPerLink: string
  expiresAt: string
  claimPolicy: 'open' | 'code' | 'email' | 'passkey'
  reminderDaysBefore: number[]
  receiveAsRaw: string
  allowExchangeDeposit: boolean
  recipientsCsv: string
  linkCount: number
}

function receiveAsRawOf(receiveAs: TemplateTerms['receiveAs']): string {
  return (receiveAs ?? []).map((a) => (a.assetCode === 'XLM' ? 'XLM' : `${a.assetCode}:${a.assetIssuer}`)).join('\n')
}

/** The wizard prefilled from a template (#82): a MANUAL run once signed. Null when the template is not this organisation's. */
export async function prefillFromTemplate(templateId: string, organizationId: string, maxLinks: number, now: Date = new Date()): Promise<TemplatePrefill | null> {
  const template = await loadTemplate(templateId, organizationId)
  if (!template) return null
  const terms = termsOf(template)
  const recipients = parseRecipients(template.recipientsCsv, maxLinks)
  const count = recipients.ok ? recipients.recipients.labels.length : 0
  return {
    templateId: template.id, templateName: template.name, draftCampaignId: null,
    name: `${template.name} — ${now.toISOString().slice(0, 10)}`,
    network: terms.network, senderPublicKey: terms.senderPublicKey, assetCode: terms.assetCode, assetIssuer: terms.assetIssuer ?? null,
    amountPerLink: new Decimal(terms.amountPerLink).toFixed(), expiresAt: new Date(now.getTime() + terms.expiryDays * 86_400_000).toISOString(),
    claimPolicy: terms.claimPolicy ?? 'open', reminderDaysBefore: terms.reminderDaysBefore ?? [], receiveAsRaw: receiveAsRawOf(terms.receiveAs),
    allowExchangeDeposit: terms.allowExchangeDeposit ?? false, recipientsCsv: recipients.ok ? template.recipientsCsv : '', linkCount: count,
  }
}

/**
 * The wizard continuing a PREPARED run (#82): the DRAFT campaign's own terms
 * (they are what any approval binds to), and the template's list. Null when
 * the campaign is not this organisation's, not a template run, or past DRAFT.
 */
export async function prefillFromDraft(campaignId: string, organizationId: string, maxLinks: number): Promise<TemplatePrefill | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { ...owned(campaignId, organizationId), status: 'DRAFT', templateRun: { isNot: null } },
    select: {
      id: true, name: true, network: true, senderPublicKey: true, assetCode: true, assetIssuer: true, amountPerLink: true, linkCount: true, expiresAt: true,
      claimPolicy: true, reminderDaysBefore: true, receiveAsAssets: true, allowExchangeDeposit: true,
      _count: { select: { links: true } },
      // The list AS PREPARED, not the template's current one: the count was fixed for this list.
      templateRun: { select: { recipientsCsv: true, template: { select: { id: true, name: true } } } },
    },
  })
  if (!campaign || !campaign.templateRun || campaign._count.links > 0) return null
  const template = { ...campaign.templateRun.template, recipientsCsv: campaign.templateRun.recipientsCsv }
  const recipients = parseRecipients(template.recipientsCsv, maxLinks)
  return {
    templateId: template.id, templateName: template.name, draftCampaignId: campaign.id,
    name: campaign.name, network: campaign.network === 'public' ? 'public' : 'testnet', senderPublicKey: campaign.senderPublicKey,
    assetCode: campaign.assetCode, assetIssuer: campaign.assetIssuer, amountPerLink: serialiseAmount(campaign.amountPerLink), expiresAt: campaign.expiresAt.toISOString(),
    claimPolicy: campaign.claimPolicy.toLowerCase() as TemplatePrefill['claimPolicy'], reminderDaysBefore: campaign.reminderDaysBefore,
    receiveAsRaw: campaign.receiveAsAssets.join('\n'), allowExchangeDeposit: campaign.allowExchangeDeposit,
    recipientsCsv: recipients.ok ? template.recipientsCsv : '', linkCount: campaign.linkCount,
  }
}
