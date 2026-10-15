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
import { renewalSource, RenewalRefused } from './renewal'

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
  budget: string
  draftCampaignId: string | null
  draftExpiry: string | null
  derivationIndex: number | null
  keyFingerprint: string | null
  registeredPublicKeys: string[]
  draftPolicy: 'open' | 'code' | 'email' | 'passkey' | 'wallet' | null
  draftReminders: number[]
  draftReceiveAs: string
  draftExchangeDeposit: boolean
}

/**
 * Compatibility loader for old ?reissue URLs. They now use the same safe
 * renewal gate as ?renew: expired, fully reclaimed, exact confirmed budget.
 */
export async function loadReissueSource(
  campaignId: string,
  organizationId: string,
  now: Date = new Date(),
): Promise<{ reissue: ReissueSource | null; refused: string | null }> {
  let value
  try { value = await renewalSource(campaignId, organizationId, readSenderBalances, now) }
  catch (error) {
    if (error instanceof RenewalRefused) return { reissue: null, refused: error.message }
    throw error
  }
  const { source, count, budget } = value
  const draft = source.renewal
  if (draft && (draft.status !== 'DRAFT' || draft.expiresAt <= now)) return { reissue: null, refused: 'This campaign already has a renewal. Open its renewal round from the original campaign to inspect or recover it.' }
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
      outstanding: count,
      expiresAt: source.expiresAt.toISOString(),
      budget,
      draftCampaignId: draft?.id ?? null,
      draftExpiry: draft?.expiresAt.toISOString() ?? null,
      derivationIndex: draft?.derivationIndex ?? null,
      keyFingerprint: draft?.keyFingerprint ?? null,
      registeredPublicKeys: draft?.links.map((l) => l.ephemeralPublicKey) ?? [],
      draftPolicy: draft ? draft.claimPolicy.toLowerCase() as ReissueSource['draftPolicy'] : null,
      draftReminders: draft?.reminderDaysBefore ?? [],
      draftReceiveAs: draft?.receiveAsAssets.join('\n') ?? '',
      draftExchangeDeposit: draft?.allowExchangeDeposit ?? false,
    },
  }
}
