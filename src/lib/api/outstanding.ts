/**
 * The outstanding view (#78): what is still unclaimed, from the LEDGER.
 *
 * `amountPerLink × unclaimed rows` is the database's guess. The number a
 * sender manages against is what the chain still holds for their campaign:
 * the sender's claimable balances (one Horizon stream, as reclaim reads them)
 * intersected with this campaign's balance ids, summed from the ledger's own
 * amounts. Where the two disagree, reconciliation will say so; this view does
 * not pretend they agree.
 */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/client'
import { owned } from './session-guard'
import { readSenderBalances, type SenderBalanceReader } from './reclaim'

export interface Outstanding {
  /** Balances the ledger still holds for this campaign. */
  count: number
  /** Their total, summed from the ledger's amounts. */
  amount: string
  assetCode: string
  /** The database's view, for the drift column. */
  rowsUnclaimed: number
  expiresAt: string
  expired: boolean
  /** The reclaim is scheduled for `expiresAt`; `reclaimDueAt` is when the sweep announced it. */
  reclaimScheduledFor: string
  reclaimDueAt: string | null
  reclaimed: { transactionHash: string; amount: string; balanceCount: number; submittedAt: string }[]
  reminderDaysBefore: number[]
  /** Deliveries that can be reminded at all — Kleym has an address for them. */
  remindable: number
  suspendedAt: string | null
}

/** Pure: the ledger's balances for these links, counted and summed. */
export function outstandingFromLedger(
  links: { balanceId: string | null }[],
  onLedger: Map<string, string>,
): { count: number; amount: string } {
  let count = 0
  let total = new Decimal(0)
  for (const link of links) {
    if (!link.balanceId) continue
    const amount = onLedger.get(link.balanceId)
    if (amount === undefined) continue
    count += 1
    total = total.plus(amount)
  }
  return { count, amount: total.toFixed() }
}

export async function loadOutstanding(
  campaignId: string,
  organizationId: string,
  readBalances: SenderBalanceReader = readSenderBalances,
  now: Date = new Date(),
): Promise<Outstanding | null> {
  const campaign = await prisma.campaign.findFirst({
    where: owned(campaignId, organizationId),
    select: {
      id: true, senderPublicKey: true, assetCode: true, expiresAt: true, reclaimDueAt: true, suspendedAt: true, reminderDaysBefore: true,
      reclaims: { orderBy: { submittedAt: 'desc' }, select: { transactionHash: true, amount: true, balanceCount: true, submittedAt: true } },
    },
  })
  if (!campaign) return null

  const [links, rowsUnclaimed, remindable, onLedger] = await Promise.all([
    prisma.claimLink.findMany({ where: { campaignId: campaign.id, balanceId: { not: null } }, select: { balanceId: true } }),
    prisma.claimLink.count({ where: { campaignId: campaign.id, status: { in: ['ACTIVE', 'EXPIRED'] } } }),
    // The same links the reminder pass will mail: a suspended link is not reminded.
    prisma.delivery.count({ where: { sentAt: { not: null }, email: { not: null }, link: { campaignId: campaign.id, status: 'ACTIVE', suspendedAt: null } } }),
    readBalances(campaign.senderPublicKey),
  ])
  const { count, amount } = outstandingFromLedger(links, onLedger)

  return {
    count,
    amount,
    assetCode: campaign.assetCode,
    rowsUnclaimed,
    expiresAt: campaign.expiresAt.toISOString(),
    expired: campaign.expiresAt.getTime() <= now.getTime(),
    reclaimScheduledFor: campaign.expiresAt.toISOString(),
    reclaimDueAt: campaign.reclaimDueAt?.toISOString() ?? null,
    reclaimed: campaign.reclaims.map((r) => ({ transactionHash: r.transactionHash, amount: r.amount.toFixed(), balanceCount: r.balanceCount, submittedAt: r.submittedAt.toISOString() })),
    reminderDaysBefore: campaign.reminderDaysBefore,
    remindable,
    suspendedAt: campaign.suspendedAt?.toISOString() ?? null,
  }
}

export interface ReissueSource {
  id: string
  name: string
  network: 'testnet' | 'public'
  senderPublicKey: string
  assetCode: string
  assetIssuer: string | null
  amountPerLink: string
  outstanding: number
  expiresAt: string
}

/**
 * The campaign a reissue (#78) replaces the unclaimed links of — its terms,
 * if it is ours and has not expired. Refused after expiry: those links are
 * dead and reclaimable, and a later expiry cannot be "extended" onto them; a
 * new campaign for anyone still owed is an ordinary new campaign. The clock
 * is read here, not during render.
 */
export async function loadReissueSource(
  campaignId: string,
  organizationId: string,
  now: Date = new Date(),
): Promise<{ reissue: ReissueSource | null; refused: string | null }> {
  const source = await prisma.campaign.findFirst({
    where: owned(campaignId, organizationId),
    select: {
      id: true, name: true, network: true, senderPublicKey: true, assetCode: true, assetIssuer: true, amountPerLink: true, expiresAt: true,
      _count: { select: { links: { where: { status: 'ACTIVE' } } } },
    },
  })
  if (!source) return { reissue: null, refused: 'That campaign could not be found.' }
  if (source.expiresAt.getTime() <= now.getTime()) {
    return {
      reissue: null,
      refused: `“${source.name}” has expired. Its links are dead and can be reclaimed; a later expiry cannot be reissued from it — create a new campaign for anyone still owed.`,
    }
  }
  return {
    refused: null,
    reissue: {
      id: source.id,
      name: source.name,
      network: source.network === 'public' ? 'public' : 'testnet',
      senderPublicKey: source.senderPublicKey,
      assetCode: source.assetCode,
      assetIssuer: source.assetIssuer,
      amountPerLink: new Decimal(source.amountPerLink.toString()).toFixed(),
      outstanding: source._count.links,
      expiresAt: source.expiresAt.toISOString(),
    },
  }
}
