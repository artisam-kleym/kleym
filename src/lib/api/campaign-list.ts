/**
 * The two cross-campaign reads the sender surface has: `/campaigns` and
 * `/history`. SPEC.md §5.2.
 *
 * Both are aggregates over the caller's OWN rows. `userId` goes into the
 * `where` of every query here, never into a filter afterwards (AGENT.md §5.4)
 * — and search runs inside that scope, so it can only ever match the caller's
 * own campaigns and cannot become an enumeration surface.
 *
 * The where-clauses and the query parsers are exported on their own so the
 * scoping is unit-testable without a database: a test that `userId` is in the
 * clause is the test that matters.
 */
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { serialiseAmount } from './campaigns'

export const CAMPAIGN_STATUSES = [
  'DRAFT', 'CREATING', 'ACTIVE', 'PARTIAL', 'EXPIRED', 'RECLAIMED', 'CANCELLED',
] as const

const page = z.coerce.number().int().min(1).default(1)
const perPage = z.coerce.number().int().min(1).max(100).default(25)
/** An empty select or input submits `''`; that means "no filter", not an error. */
const blank = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional())

export const campaignListQuerySchema = z.object({
  q: blank(z.string().trim().max(100)),
  status: blank(z.enum(CAMPAIGN_STATUSES)),
  page,
  perPage,
})
export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>

export const historyQuerySchema = z.object({
  campaignId: blank(z.string().max(64)),
  from: blank(z.coerce.date()),
  to: blank(z.coerce.date()),
  page,
  perPage,
})
export type HistoryQuery = z.infer<typeof historyQuerySchema>

/**
 * Total order. Campaigns sharing a `createdAt` are the ordinary case —
 * Postgres `CURRENT_TIMESTAMP` is transaction time — and a sort with ties is
 * unstable across page loads (lib/api/link-order.ts has the write-up).
 */
export const CAMPAIGN_ORDER: Prisma.CampaignOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
]
export const HISTORY_ORDER: Prisma.ClaimLinkOrderByWithRelationInput[] = [
  { claimedAt: 'desc' },
  { id: 'desc' },
]

export function campaignListWhere(userId: string, query: CampaignListQuery): Prisma.CampaignWhereInput {
  return {
    userId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
  }
}

/**
 * Claims and reclaims live on the link, not in a table of their own:
 * `claimedAt`, `claimedBy` and `claimTxHash` are the record. Ownership is
 * through the campaign relation, in the same clause.
 */
export function historyWhere(userId: string, query: HistoryQuery): Prisma.ClaimLinkWhereInput {
  const claimedAt =
    query.from || query.to
      ? { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: endOfDay(query.to) } : {}) }
      : undefined
  return {
    campaign: { userId, ...(query.campaignId ? { id: query.campaignId } : {}) },
    status: { in: ['CLAIMED', 'RECLAIMED'] },
    ...(claimedAt ? { claimedAt } : {}),
  }
}

/** A `to` date means "through that day", not "up to its first millisecond". */
function endOfDay(date: Date): Date {
  const end = new Date(date)
  end.setUTCHours(23, 59, 59, 999)
  return end
}

export interface CampaignListRow {
  id: string
  name: string
  network: string
  assetCode: string
  amountPerLink: string
  linkCount: number
  claimed: number
  status: string
  expiresAt: Date
  createdAt: Date
}

export async function listCampaigns(userId: string, query: CampaignListQuery) {
  const where = campaignListWhere(userId, query)
  const [total, campaigns] = await Promise.all([
    prisma.campaign.count({ where }),
    prisma.campaign.findMany({
      where,
      orderBy: CAMPAIGN_ORDER,
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      select: {
        id: true, name: true, network: true, assetCode: true, amountPerLink: true,
        linkCount: true, status: true, expiresAt: true, createdAt: true,
        // A count, not the rows. Ten thousand links per campaign is supported.
        _count: { select: { links: { where: { status: 'CLAIMED' } } } },
      },
    }),
  ])

  const rows: CampaignListRow[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    network: c.network,
    assetCode: c.assetCode,
    amountPerLink: serialiseAmount(c.amountPerLink),
    linkCount: c.linkCount,
    claimed: c._count.links,
    status: c.status,
    expiresAt: c.expiresAt,
    createdAt: c.createdAt,
  }))
  return { rows, total, page: query.page, perPage: query.perPage }
}

export interface HistoryRow {
  linkId: string
  campaignId: string
  campaignName: string
  network: string
  assetCode: string
  amount: string
  status: 'CLAIMED' | 'RECLAIMED'
  claimedAt: Date | null
  claimedBy: string | null
  claimTxHash: string | null
}

export async function claimHistory(userId: string, query: HistoryQuery) {
  const where = historyWhere(userId, query)
  const [total, links] = await Promise.all([
    prisma.claimLink.count({ where }),
    prisma.claimLink.findMany({
      where,
      orderBy: HISTORY_ORDER,
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      select: {
        id: true, status: true, claimedAt: true, claimedBy: true, claimTxHash: true,
        campaign: { select: { id: true, name: true, network: true, assetCode: true, amountPerLink: true } },
      },
    }),
  ])

  const rows: HistoryRow[] = links.map((link) => ({
    linkId: link.id,
    campaignId: link.campaign.id,
    campaignName: link.campaign.name,
    network: link.campaign.network,
    assetCode: link.campaign.assetCode,
    amount: serialiseAmount(link.campaign.amountPerLink),
    status: link.status as 'CLAIMED' | 'RECLAIMED',
    claimedAt: link.claimedAt,
    claimedBy: link.claimedBy,
    claimTxHash: link.claimTxHash,
  }))
  return { rows, total, page: query.page, perPage: query.perPage }
}

/** For the history page's campaign filter: names only, the caller's own. */
export function campaignNames(userId: string) {
  return prisma.campaign.findMany({
    where: { userId },
    orderBy: CAMPAIGN_ORDER,
    select: { id: true, name: true },
  })
}

/** Stellar Expert, per network. */
export function explorerTxUrl(network: string, hash: string): string {
  return `https://stellar.expert/explorer/${network === 'public' ? 'public' : 'testnet'}/tx/${hash}`
}
