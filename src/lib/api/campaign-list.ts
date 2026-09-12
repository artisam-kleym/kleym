/**
 * The two cross-campaign reads the sender surface has: `/campaigns` and
 * `/history`. SPEC.md §5.2.
 *
 * Both are aggregates over the caller's ORGANISATION's rows. `organizationId`
 * goes into the `where` of every query here, never into a filter afterwards
 * (AGENT.md §5.4) — and search runs inside that scope, so it can only ever
 * match that organisation's campaigns and cannot become an enumeration surface.
 *
 * The where-clauses and the query parsers are exported on their own so the
 * scoping is unit-testable without a database: a test that `organizationId` is in the
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
 * Parses a filter form field by field: a typo in one drops only that one.
 *
 * A whole-object parse fails on the first bad value, so a mistyped `to` date
 * would have thrown away the campaign filter with it and shown every row —
 * with the form still displaying what was typed. Each field is parsed on its
 * own and a failure falls back to that field's default.
 */
export function parseFilters<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  raw: Record<string, string>,
): z.infer<z.ZodObject<T>> {
  const out: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(schema.shape)) {
    const parsed = (field as z.ZodTypeAny).safeParse(raw[key])
    if (parsed.success) out[key] = parsed.data
    else {
      const fallback = (field as z.ZodTypeAny).safeParse(undefined)
      if (fallback.success) out[key] = fallback.data
    }
  }
  return out as z.infer<z.ZodObject<T>>
}

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

export function campaignListWhere(organizationId: string, query: CampaignListQuery): Prisma.CampaignWhereInput {
  return {
    organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
  }
}

/**
 * Claims and reclaims live on the link, not in a table of their own:
 * `claimedAt`, `claimedBy` and `claimTxHash` are the record. Ownership is
 * through the campaign relation, in the same clause.
 */
export function historyWhere(organizationId: string, query: HistoryQuery): Prisma.ClaimLinkWhereInput {
  const claimedAt =
    query.from || query.to
      ? { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: endOfDay(query.to) } : {}) }
      : undefined
  return {
    campaign: { organizationId, ...(query.campaignId ? { id: query.campaignId } : {}) },
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

export async function listCampaigns(organizationId: string, query: CampaignListQuery) {
  const where = campaignListWhere(organizationId, query)
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

export async function claimHistory(organizationId: string, query: HistoryQuery) {
  const where = historyWhere(organizationId, query)
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

/** For the history page's campaign filter: names only, the organisation's own. */
export function campaignNames(organizationId: string) {
  return prisma.campaign.findMany({
    where: { organizationId },
    orderBy: CAMPAIGN_ORDER,
    select: { id: true, name: true },
  })
}

/** Stellar Expert, per network. */
export function explorerTxUrl(network: string, hash: string): string {
  return `https://stellar.expert/explorer/${network === 'public' ? 'public' : 'testnet'}/tx/${hash}`
}
