/**
 * Suspension (#72) — what "cancel" honestly is once a campaign is funded.
 *
 * `claimantsFor` (lib/stellar/batch.ts) writes two claimants: the recipient
 * before `expiresAt`, the sender from `expiresAt` on. There is no instant at
 * which the sender can take a balance back early, so nothing Kleym does can
 * stop a link holder claiming before expiry. What Kleym CAN do is stop
 * participating — refuse to resolve or prepare the link — and make sure the
 * unclaimed funds come back the moment the sender's predicate turns true.
 *
 * That is what suspension is: a flag that the claim path reads, plus a
 * scheduled reclaim. The reclaim itself is signed by the sender's wallet
 * (SPEC.md §3.4) — Kleym holds no key that can move the money — so "scheduled"
 * means the expiry sweep marks it due and announces it, not that it submits.
 * None of this writes to the ledger; tests/lib/api/suspend.test.ts pins that
 * the balances stay claimable, so nobody mistakes this for revocation.
 */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { emitWebhook } from '@/lib/webhooks/emit'
import { recordAudit } from './audit'
import { owned } from './session-guard'

export type SuspendRefusal = 'draft' | 'settled' | 'expired'

export type SuspensionDecision =
  | { kind: 'ok' }
  | { kind: 'already' }
  | { kind: 'refuse'; reason: SuspendRefusal; detail: string }

/**
 * Whether a campaign can be suspended now. Pure, so the table of cases is a
 * unit test rather than a database fixture.
 */
export function suspensionDecision(
  campaign: { status: string; expiresAt: Date; suspendedAt: Date | null },
  now: Date,
): SuspensionDecision {
  if (campaign.suspendedAt) return { kind: 'already' }
  if (campaign.status === 'DRAFT') {
    return {
      kind: 'refuse',
      reason: 'draft',
      detail: 'A draft has no funds on the ledger. Cancel it instead.',
    }
  }
  if (campaign.status === 'EXPIRED' || campaign.status === 'RECLAIMED' || campaign.status === 'CANCELLED') {
    return {
      kind: 'refuse',
      reason: 'settled',
      detail: `This campaign is ${campaign.status.toLowerCase()}; there is nothing left to suspend.`,
    }
  }
  // The row can say ACTIVE for up to an hour after expiry (the sweep is
  // hourly). Past expiresAt the sender can reclaim, which is the real action.
  if (campaign.expiresAt.getTime() <= now.getTime()) {
    return {
      kind: 'refuse',
      reason: 'expired',
      detail: 'This campaign has expired. Reclaim the unclaimed funds instead.',
    }
  }
  return { kind: 'ok' }
}

/** `count × amountPerLink`, in Decimal. AGENT.md §4.1: this is money on a page. */
export function outstandingValue(count: number, amountPerLink: string | Decimal): string {
  return new Decimal(amountPerLink).times(count).toFixed()
}

export interface Suspension {
  suspendedAt: Date
  /** The reclaim is scheduled for this instant — the sender's predicate turns true then. */
  expiresAt: Date
  /** Links whose balance the ledger may still hold, as the database sees it. */
  outstanding: number
  outstandingAmount: string
  assetCode: string
  already: boolean
}

export type SuspendOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not-found' }
  | { kind: 'conflict'; detail: string; reason: SuspendRefusal | 'not-active' }

export interface Actor {
  userId: string
  ip: string | null
}

const CAMPAIGN_SELECT = {
  id: true, status: true, expiresAt: true, suspendedAt: true, amountPerLink: true, assetCode: true, organizationId: true,
} as const

async function outstandingLinks(campaignId: string): Promise<number> {
  // ACTIVE and EXPIRED both mean "a balance was created and nothing says it
  // moved" — the same reading settleReclaimStatus uses.
  return prisma.claimLink.count({ where: { campaignId, status: { in: ['ACTIVE', 'EXPIRED'] } } })
}

/**
 * Suspends the whole campaign. Idempotent: a second call reports the first
 * suspension rather than re-auditing it.
 */
export async function suspendCampaign(
  campaignId: string,
  organizationId: string,
  actor: Actor,
  now: Date = new Date(),
): Promise<SuspendOutcome<Suspension>> {
  const campaign = await prisma.campaign.findFirst({ where: owned(campaignId, organizationId), select: CAMPAIGN_SELECT })
  if (!campaign) return { kind: 'not-found' }

  const decision = suspensionDecision(campaign, now)
  if (decision.kind === 'refuse') return { kind: 'conflict', detail: decision.detail, reason: decision.reason }

  const outstanding = await outstandingLinks(campaign.id)
  const outstandingAmount = outstandingValue(outstanding, campaign.amountPerLink.toString())

  if (decision.kind === 'already') {
    return {
      kind: 'ok',
      value: { suspendedAt: campaign.suspendedAt!, expiresAt: campaign.expiresAt, outstanding, outstandingAmount, assetCode: campaign.assetCode, already: true },
    }
  }

  await prisma.campaign.update({ where: { id: campaign.id }, data: { suspendedAt: now } })
  await recordAudit({
    userId: actor.userId, organizationId, action: 'campaign.suspend', entityType: 'campaign', entityId: campaign.id,
    metadata: { previousStatus: campaign.status, outstanding, outstandingAmount, reclaimScheduledFor: campaign.expiresAt.toISOString() },
    ip: actor.ip,
  })
  await emitWebhook(organizationId, 'campaign.suspended', {
    campaignId: campaign.id, outstanding, outstandingAmount, assetCode: campaign.assetCode,
    suspendedAt: now.toISOString(), reclaimScheduledFor: campaign.expiresAt.toISOString(),
  })
  logger.info({ campaignId: campaign.id, outstanding }, 'campaign suspended; reclaim scheduled at expiry')

  return {
    kind: 'ok',
    value: { suspendedAt: now, expiresAt: campaign.expiresAt, outstanding, outstandingAmount, assetCode: campaign.assetCode, already: false },
  }
}

export interface LinkSuspension {
  linkId: string
  suspendedAt: Date
  expiresAt: Date
  amount: string
  assetCode: string
  already: boolean
}

/**
 * Suspends one link — the wrong-recipient case. Only an ACTIVE link: a
 * PENDING or FAILED one has no balance to be honest about, and a CLAIMED,
 * EXPIRED or RECLAIMED one is settled.
 */
export async function suspendLink(
  campaignId: string,
  linkId: string,
  organizationId: string,
  actor: Actor,
  now: Date = new Date(),
): Promise<SuspendOutcome<LinkSuspension>> {
  const campaign = await prisma.campaign.findFirst({ where: owned(campaignId, organizationId), select: CAMPAIGN_SELECT })
  if (!campaign) return { kind: 'not-found' }

  const decision = suspensionDecision({ ...campaign, suspendedAt: null }, now)
  if (decision.kind === 'refuse') return { kind: 'conflict', detail: decision.detail, reason: decision.reason }

  const link = await prisma.claimLink.findFirst({
    where: { id: linkId, campaignId: campaign.id },
    select: { id: true, status: true, suspendedAt: true },
  })
  if (!link) return { kind: 'not-found' }

  const amount = campaign.amountPerLink.toString()
  const base = { linkId: link.id, expiresAt: campaign.expiresAt, amount, assetCode: campaign.assetCode }

  if (link.suspendedAt) return { kind: 'ok', value: { ...base, suspendedAt: link.suspendedAt, already: true } }
  if (link.status !== 'ACTIVE') {
    return {
      kind: 'conflict',
      reason: 'not-active',
      detail: `This link is ${link.status.toLowerCase()}; only a live link can be suspended.`,
    }
  }

  await prisma.claimLink.update({ where: { id: link.id }, data: { suspendedAt: now } })
  await recordAudit({
    userId: actor.userId, organizationId, action: 'link.suspend', entityType: 'link', entityId: link.id,
    metadata: { campaignId: campaign.id, amount, reclaimScheduledFor: campaign.expiresAt.toISOString() },
    ip: actor.ip,
  })
  logger.info({ campaignId: campaign.id, linkId: link.id }, 'link suspended; reclaim scheduled at expiry')

  return { kind: 'ok', value: { ...base, suspendedAt: now, already: false } }
}

export interface ReclaimDueReport {
  reclaimsDue: number
}

/**
 * The scheduled half. Runs inside the hourly expiry sweep: every campaign
 * whose `expiresAt` has passed with links still unclaimed — suspended or not
 * (#78 made the schedule universal, #72 introduced it) — is marked due once
 * and its organisation told that the reclaim is ready to sign. Bounded: one
 * update and one webhook per campaign, never per link; at most 200 campaigns
 * a pass, the rest next hour.
 */
export async function announceDueReclaims(now: Date = new Date()): Promise<ReclaimDueReport> {
  const due = await prisma.campaign.findMany({
    where: { reclaimDueAt: null, expiresAt: { lte: now }, status: { in: ['ACTIVE', 'PARTIAL', 'CREATING', 'EXPIRED'] } },
    select: { id: true, organizationId: true, amountPerLink: true, assetCode: true, expiresAt: true },
    take: 200,
  })

  let announced = 0
  for (const campaign of due) {
    const outstanding = await outstandingLinks(campaign.id)
    // Claim the row first so a crash between the update and the webhook
    // loses one notice rather than sending it every hour.
    const marked = await prisma.campaign.updateMany({
      where: { id: campaign.id, reclaimDueAt: null },
      data: { reclaimDueAt: now },
    })
    if (marked.count === 0) continue
    // Nothing outstanding means nothing to reclaim: marked so it is not re-read, but no notice.
    if (outstanding === 0) continue
    announced += 1
    await emitWebhook(campaign.organizationId, 'campaign.reclaim_due', {
      campaignId: campaign.id, outstanding, outstandingAmount: outstandingValue(outstanding, campaign.amountPerLink.toString()),
      assetCode: campaign.assetCode, expiresAt: campaign.expiresAt.toISOString(),
    })
  }

  if (announced > 0) logger.info({ reclaimsDue: announced }, 'scheduled reclaims are due for signing')
  return { reclaimsDue: announced }
}
