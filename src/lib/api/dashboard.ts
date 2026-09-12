/**
 * The sender dashboard's figures. SPEC.md §5.2, issue #42.
 *
 * Every number here is an AGGREGATE — a `count`, a `groupBy`, or one SUM in
 * SQL — scoped to the signed-in user in the query. The dashboard is the
 * post-login landing page, so it is the first thing a 10,000-link campaign
 * would slow down; nothing here loads a link row, and nothing here reads
 * Horizon.
 *
 * Money is `Decimal` and leaves as `.toFixed()`, never `.toString()` —
 * `Decimal.toString()` renders one stroop as `1e-7`, and this is a page a
 * person reads a total off (AGENT.md §4.1).
 */
import Decimal from 'decimal.js'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { CAMPAIGN_ORDER } from './campaign-list'
import { serialiseAmount } from './campaigns'

export interface DistributedRow {
  assetCode: string
  /** Sum of `amountPerLink` over CLAIMED links, as a fixed-point string. */
  amount: string
  claimed: number
}

/**
 * Total distributed = CLAIMED value, by asset. Not `linkCount × amountPerLink`:
 * created value is not distributed value, and the larger number on a page
 * headed "distributed" is what a finance user stops trusting the product over.
 *
 * `$queryRaw`, justified: this is a SUM of a campaign column over a filtered
 * join to its links, grouped by the campaign's asset. Prisma's `groupBy`
 * cannot aggregate across a relation, and the alternative — loading one row
 * per campaign and summing in JS — is unbounded in the number of campaigns.
 * The query is a tagged template, so `userId` is a bound parameter.
 */
export async function distributedByAsset(userId: string): Promise<DistributedRow[]> {
  const rows = await prisma.$queryRaw<{ assetCode: string; amount: Prisma.Decimal | string | null; claimed: bigint }[]>(
    Prisma.sql`
      SELECT c."assetCode" AS "assetCode",
             SUM(c."amountPerLink") AS "amount",
             COUNT(l."id") AS "claimed"
      FROM "ClaimLink" l
      JOIN "Campaign" c ON c."id" = l."campaignId"
      WHERE c."userId" = ${userId} AND l."status" = 'CLAIMED'
      GROUP BY c."assetCode"
      ORDER BY c."assetCode" ASC
    `,
  )
  return rows.map((row) => ({
    assetCode: row.assetCode,
    amount: new Decimal(String(row.amount ?? 0)).toFixed(),
    claimed: Number(row.claimed),
  }))
}

export interface DashboardCounts {
  activeCampaigns: number
  /** ACTIVE links — batch confirmed, not yet claimed — whatever their expiry. */
  pendingClaims: number
  /** The subset of those whose campaign has not expired: still claimable. */
  outstanding: number
}

export async function dashboardCounts(userId: string, now: Date = new Date()): Promise<DashboardCounts> {
  const [activeCampaigns, pendingClaims, outstanding] = await Promise.all([
    prisma.campaign.count({ where: { userId, status: { in: ['ACTIVE', 'PARTIAL'] } } }),
    prisma.claimLink.count({ where: { campaign: { userId }, status: 'ACTIVE', balanceId: { not: null } } }),
    prisma.claimLink.count({
      where: { campaign: { userId, expiresAt: { gt: now } }, status: 'ACTIVE', balanceId: { not: null } },
    }),
  ])
  return { activeCampaigns, pendingClaims, outstanding }
}

export const RECENT_CAMPAIGNS = 5

export interface RecentCampaign {
  id: string
  name: string
  status: string
  assetCode: string
  amountPerLink: string
  linkCount: number
  claimed: number
  createdAt: Date
}

/** The most recent few, with a `_count` for claimed — never the links. */
export async function recentCampaigns(userId: string): Promise<RecentCampaign[]> {
  const rows = await prisma.campaign.findMany({
    where: { userId },
    orderBy: CAMPAIGN_ORDER,
    take: RECENT_CAMPAIGNS,
    select: {
      id: true, name: true, status: true, assetCode: true, amountPerLink: true, linkCount: true, createdAt: true,
      _count: { select: { links: { where: { status: 'CLAIMED' } } } },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    assetCode: row.assetCode,
    amountPerLink: serialiseAmount(row.amountPerLink),
    linkCount: row.linkCount,
    claimed: row._count.links,
    createdAt: row.createdAt,
  }))
}

export async function loadDashboard(userId: string) {
  const [distributed, counts, recent] = await Promise.all([
    distributedByAsset(userId),
    dashboardCounts(userId),
    recentCampaigns(userId),
  ])
  return { distributed, counts, recent }
}
