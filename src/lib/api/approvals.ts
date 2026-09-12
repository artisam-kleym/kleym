/**
 * Dual control: a second person approves a campaign's terms before it can
 * disburse. Issue #45.
 *
 * The gate sits where money moves — `prepareBatch` and `submitBatch` — and
 * on the CREATING → ACTIVE settle, beside the CSV hard gate. Not in front
 * of the wizard: an Operator can draft and register links freely, and the
 * approver sees exactly what will be signed.
 *
 * An approval is bound to the TERMS, not the campaign id: `termsHash` covers
 * (assetCode, assetIssuer, amountPerLink, linkCount, expiresAt), and a
 * decision whose hash no longer matches the campaign counts for nothing.
 * Approve a 10-link campaign, edit it to 10,000, sign — the first thing a
 * penetration test tries — is refused with the changed term named.
 *
 * The creator's own approval never counts, at any role including Owner.
 */
import { createHash } from 'node:crypto'
import Decimal from 'decimal.js'
import { z } from 'zod'
import type { ApprovalDecision, Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { recordAudit } from './audit'
import { owned, type OrgScope } from './session-guard'

export interface Terms {
  assetCode: string
  assetIssuer: string | null
  amountPerLink: unknown
  linkCount: number
  expiresAt: Date
}

/** Fixed-point amount and ISO time, so the hash is stable across drivers. */
export function termsHash(terms: Terms): string {
  const canonical = JSON.stringify({
    assetCode: terms.assetCode,
    assetIssuer: terms.assetIssuer ?? null,
    amountPerLink: new Decimal(String(terms.amountPerLink)).toFixed(),
    linkCount: terms.linkCount,
    expiresAt: new Date(terms.expiresAt).toISOString(),
  })
  return createHash('sha256').update(canonical).digest('hex')
}

/** Which of the five terms differ between what was approved and what is now there. */
export function changedTerms(approved: Terms, current: Terms): string[] {
  const out: string[] = []
  if (approved.assetCode !== current.assetCode) out.push('asset')
  if ((approved.assetIssuer ?? null) !== (current.assetIssuer ?? null)) out.push('issuer')
  if (!new Decimal(String(approved.amountPerLink)).equals(new Decimal(String(current.amountPerLink)))) out.push('amount per link')
  if (approved.linkCount !== current.linkCount) out.push('link count')
  if (new Date(approved.expiresAt).getTime() !== new Date(current.expiresAt).getTime()) out.push('expiry')
  return out
}

export interface Policy {
  approvalThreshold: unknown | null
  approvalsRequired: number
}

/**
 * The policy a campaign is gated by: the STRICTER of its own snapshot (taken
 * at creation) and the organisation's current policy. Tightening the
 * organisation's policy reaches campaigns in flight; loosening it does not —
 * so a single Owner cannot switch the gate off for a campaign they made,
 * sign, and switch it back on. Either threshold gating means gated.
 */
export function effectivePolicy(campaign: Policy, org: Policy): Policy & { gatedBy: (value: Decimal) => boolean } {
  const thresholds = [campaign.approvalThreshold, org.approvalThreshold]
    .filter((t): t is unknown => t !== null && t !== undefined)
    .map((t) => new Decimal(String(t)))
  const lowest = thresholds.length ? thresholds.reduce((a, b) => (a.lessThan(b) ? a : b)) : null
  return {
    approvalThreshold: lowest?.toFixed() ?? null,
    approvalsRequired: Math.max(campaign.approvalsRequired, org.approvalsRequired),
    gatedBy: (value) => lowest !== null && value.greaterThanOrEqualTo(lowest),
  }
}

/** Total value in the campaign's own asset. A per-link threshold is evaded by raising the count. */
export function campaignValue(terms: { amountPerLink: unknown; linkCount: number }): Decimal {
  return new Decimal(String(terms.amountPerLink)).times(terms.linkCount)
}

export function approvalRequired(terms: { amountPerLink: unknown; linkCount: number }, policy: Policy): boolean {
  if (policy.approvalThreshold === null || policy.approvalThreshold === undefined) return false
  return campaignValue(terms).greaterThanOrEqualTo(new Decimal(String(policy.approvalThreshold)))
}

export interface ApprovalStatus {
  required: boolean
  needed: number
  /** Approvals whose terms hash matches the campaign as it is now. */
  granted: number
  /** Approvals given for terms that have since changed. */
  stale: string[]
  rejected: { username: string; note: string | null }[]
  approvers: { username: string; decision: ApprovalDecision; note: string | null; at: Date; current: boolean }[]
  termsHash: string
  /** True when signing may proceed. */
  satisfied: boolean
  /** Why not, for the sender and the gate. */
  reason: string | null
}

const CAMPAIGN_SELECT = {
  id: true, userId: true, status: true, assetCode: true, assetIssuer: true, amountPerLink: true, linkCount: true, expiresAt: true,
  approvalThreshold: true, approvalsRequired: true,
  organization: { select: { approvalThreshold: true, approvalsRequired: true } },
  approvals: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { approverId: true, decision: true, termsHash: true, note: true, createdAt: true, approver: { select: { username: true } } },
  },
} satisfies Prisma.CampaignSelect

type Loaded = NonNullable<Awaited<ReturnType<typeof loadForApproval>>>

async function loadForApproval(campaignId: string, organizationId: string) {
  return prisma.campaign.findFirst({ where: owned(campaignId, organizationId), select: CAMPAIGN_SELECT })
}

export function statusOf(campaign: Loaded): ApprovalStatus {
  const hash = termsHash(campaign)
  const policy = effectivePolicy(campaign, campaign.organization)
  const required = policy.gatedBy(campaignValue(campaign))
  const needed = required ? Math.max(1, policy.approvalsRequired) : 0
  const current = campaign.approvals.filter((a) => a.termsHash === hash)
  const granted = current.filter((a) => a.decision === 'APPROVED').length
  const rejected = current.filter((a) => a.decision === 'REJECTED').map((a) => ({ username: a.approver.username, note: a.note }))
  const stale = campaign.approvals.filter((a) => a.termsHash !== hash && a.decision === 'APPROVED').map((a) => a.approver.username)

  let reason: string | null = null
  if (required && rejected.length > 0) reason = `Rejected by ${rejected.map((r) => r.username).join(', ')}.`
  else if (required && granted < needed) {
    reason = stale.length > 0
      ? `The terms changed after ${stale.join(', ')} approved; approval is needed again.`
      : `${needed - granted} more ${needed - granted === 1 ? 'approval' : 'approvals'} needed before this campaign can be signed.`
  }

  return {
    required,
    needed,
    granted,
    stale,
    rejected,
    approvers: campaign.approvals.map((a) => ({
      username: a.approver.username, decision: a.decision, note: a.note, at: a.createdAt, current: a.termsHash === hash,
    })),
    termsHash: hash,
    satisfied: !required || (rejected.length === 0 && granted >= needed),
    reason,
  }
}

export async function approvalStatus(campaignId: string, organizationId: string): Promise<ApprovalStatus | null> {
  const campaign = await loadForApproval(campaignId, organizationId)
  return campaign ? statusOf(campaign) : null
}

/**
 * The gate `prepareBatch`, `submitBatch` and the settle call. Null means
 * proceed; a string is the refusal, naming what is missing or what changed.
 * Reads the campaign fresh so an edit after approval is caught here even if
 * the caller's row is older.
 */
export async function approvalGate(campaignId: string): Promise<string | null> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: CAMPAIGN_SELECT })
  if (!campaign) return null
  const status = statusOf(campaign)
  if (status.satisfied) return null
  if (status.stale.length > 0) {
    // Name what changed, against the most recent approval that no longer matches.
    const last = campaign.approvals.filter((a) => a.decision === 'APPROVED' && a.termsHash !== status.termsHash).at(-1)
    if (last) {
      const approvedTerms = await approvedTermsFor(campaignId, last.termsHash)
      if (approvedTerms) {
        const changed = changedTerms(approvedTerms, campaign)
        return `The ${changed.join(', ') || 'terms'} changed after ${last.approver.username} approved; approval is needed again.`
      }
    }
  }
  return status.reason ?? 'Approval is needed before this campaign can be signed.'
}

/**
 * The terms as they were when a given hash was approved. Recorded in the
 * approval's audit row so "what changed" can be named without a second table.
 */
async function approvedTermsFor(campaignId: string, hash: string): Promise<Terms | null> {
  const row = await prisma.auditLog.findFirst({
    where: { action: 'campaign.approve', entityId: campaignId, metadata: { path: ['termsHash'], equals: hash } },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  })
  const m = row?.metadata as Record<string, unknown> | null
  if (!m || typeof m.assetCode !== 'string' || typeof m.linkCount !== 'number' || typeof m.expiresAt !== 'string') return null
  return {
    assetCode: m.assetCode,
    assetIssuer: typeof m.assetIssuer === 'string' ? m.assetIssuer : null,
    amountPerLink: String(m.amountPerLink),
    linkCount: m.linkCount,
    expiresAt: new Date(m.expiresAt),
  }
}

export const decisionSchema = z
  .object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(500).optional() })
  .strict()

export type DecideOutcome =
  | { kind: 'ok'; status: ApprovalStatus }
  | { kind: 'not-found' }
  | { kind: 'conflict'; detail: string }

/**
 * Records one approver's decision on the campaign's CURRENT terms. Upserts
 * on (campaign, approver): changing one's mind replaces the earlier row.
 * The creator is refused whatever their role — including Owner — because
 * maker and checker being one person is not dual control.
 */
export async function decide(
  actor: { id: string; username: string },
  org: OrgScope,
  campaignId: string,
  input: z.infer<typeof decisionSchema>,
  ip: string | null,
): Promise<DecideOutcome> {
  const campaign = await loadForApproval(campaignId, org.id)
  if (!campaign) return { kind: 'not-found' }
  if (campaign.userId === actor.id) {
    return { kind: 'conflict', detail: 'You created this campaign; a different approver has to sign it off.' }
  }
  if (campaign.status !== 'DRAFT' && campaign.status !== 'CREATING' && campaign.status !== 'PARTIAL') {
    return { kind: 'conflict', detail: `This campaign is ${campaign.status}; approval applies before signing.` }
  }

  const hash = termsHash(campaign)
  await prisma.campaignApproval.upsert({
    where: { campaignId_approverId: { campaignId: campaign.id, approverId: actor.id } },
    create: { campaignId: campaign.id, approverId: actor.id, decision: input.decision, termsHash: hash, note: input.note ?? null },
    update: { decision: input.decision, termsHash: hash, note: input.note ?? null, createdAt: new Date() },
  })

  await recordAudit({
    userId: actor.id,
    organizationId: org.id,
    action: input.decision === 'APPROVED' ? 'campaign.approve' : 'campaign.reject',
    entityType: 'campaign',
    entityId: campaign.id,
    // The terms themselves ride along so a later "what changed" can be named.
    metadata: {
      termsHash: hash,
      assetCode: campaign.assetCode,
      assetIssuer: campaign.assetIssuer,
      amountPerLink: new Decimal(String(campaign.amountPerLink)).toFixed(),
      linkCount: campaign.linkCount,
      expiresAt: campaign.expiresAt.toISOString(),
      ...(input.note ? { note: input.note } : {}),
    },
    ip,
  })
  logger.info({ actorId: actor.id, campaignId: campaign.id, decision: input.decision }, 'campaign decision recorded')

  const after = await loadForApproval(campaignId, org.id)
  return { kind: 'ok', status: statusOf(after!) }
}

/** Campaigns in the organisation still waiting on approval — the approver's queue. */
export async function approvalQueue(organizationId: string) {
  const campaigns = await prisma.campaign.findMany({
    where: { organizationId, status: { in: ['DRAFT', 'CREATING', 'PARTIAL'] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { ...CAMPAIGN_SELECT, name: true, createdAt: true, user: { select: { username: true } } },
  })
  return campaigns
    .map((c) => ({ id: c.id, name: c.name, createdAt: c.createdAt, creator: c.user.username, creatorId: c.userId,
      value: campaignValue(c).toFixed(), assetCode: c.assetCode, status: statusOf(c) }))
    .filter((c) => c.status.required && !c.status.satisfied)
}

export const policySchema = z
  .object({
    /** Null turns dual control off. */
    approvalThreshold: z.union([z.string().regex(/^\d+(\.\d{1,7})?$/, 'a decimal amount'), z.null()]),
    approvalsRequired: z.number().int().min(1).max(10),
  })
  .strict()
