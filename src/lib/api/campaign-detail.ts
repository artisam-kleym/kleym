/**
 * What `/campaigns/[id]` and `/campaigns/[id]/links` read. SPEC.md §5.2.
 *
 * Bounded by construction. The detail page used to select every link of the
 * campaign with no `take` — ten thousand rows into one RSC payload at
 * `MAX_LINKS_PER_CAMPAIGN`, then four `filter` passes to count four of them.
 * This is the second time an unbounded read shipped and reading the code did
 * not catch it either time, so the loaders live here where a verify script
 * can drive them at full size and assert the row counts.
 *
 * Ownership is in every query (`owned()`, AGENT.md §5.4).
 */
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { owned } from './session-guard'
import { LINK_ORDER } from './link-order'

/** Links the detail page previews before handing off to the full table. */
export const LINK_PREVIEW = 10

export const LINK_STATUSES = ['PENDING', 'ACTIVE', 'CLAIMED', 'EXPIRED', 'RECLAIMED', 'FAILED'] as const
export type LinkStatus = (typeof LINK_STATUSES)[number]

const blank = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional())

export const linksQuerySchema = z.object({
  status: blank(z.enum(LINK_STATUSES)),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
})
export type LinksQuery = z.infer<typeof linksQuerySchema>

export type StatusCounts = Record<LinkStatus, number>

/**
 * One `groupBy` returning at most six rows, instead of loading every link to
 * count them — the same shape lib/api/admin.ts uses for its claimed count.
 */
export async function statusCounts(campaignId: string): Promise<StatusCounts> {
  const grouped = await prisma.claimLink.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { _all: true },
  })
  const counts = Object.fromEntries(LINK_STATUSES.map((s) => [s, 0])) as StatusCounts
  for (const row of grouped) counts[row.status] = row._count._all
  return counts
}

export const LINK_SELECT = {
  id: true, status: true, label: true, reference: true, category: true, claimedBy: true, claimTxHash: true, claimedAt: true,
} satisfies Prisma.ClaimLinkSelect

export function linksWhere(campaignId: string, status?: LinkStatus): Prisma.ClaimLinkWhereInput {
  return { campaignId, ...(status ? { status } : {}) }
}

/** One page of a campaign's links, in `LINK_ORDER` — the same order the preview uses. */
export async function linksPage(campaignId: string, query: LinksQuery) {
  const where = linksWhere(campaignId, query.status)
  const [total, links] = await Promise.all([
    prisma.claimLink.count({ where }),
    prisma.claimLink.findMany({
      where,
      orderBy: LINK_ORDER,
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      select: LINK_SELECT,
    }),
  ])
  return { links, total, page: query.page, perPage: query.perPage }
}

/**
 * Everything the detail page renders. `links` is the first `LINK_PREVIEW`
 * rows and nothing more; the counts come from `statusCounts`, not from them.
 */
export async function loadCampaignDetail(id: string, organizationId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: owned(id, organizationId),
    select: {
      id: true, userId: true, name: true, status: true, assetCode: true, amountPerLink: true, derivationIndex: true, keyFingerprint: true,
      linkCount: true, expiresAt: true, senderPublicKey: true, network: true,
      screeningDecision: true, screeningReason: true, screenedAt: true,
      links: { orderBy: LINK_ORDER, take: LINK_PREVIEW, select: LINK_SELECT },
      reclaims: {
        orderBy: { submittedAt: 'desc' },
        select: { transactionHash: true, amount: true, balanceCount: true, submittedAt: true },
      },
    },
  })
  if (!campaign) return null

  const counts = await statusCounts(campaign.id)
  return {
    campaign,
    counts,
    outstanding: counts.ACTIVE + counts.EXPIRED,
    // Answered once, here, rather than by reading the clock during render.
    expired: campaign.expiresAt.getTime() <= Date.now(),
  }
}

/** The campaign header the links table needs, ownership-scoped. */
export function loadCampaignHeader(id: string, organizationId: string) {
  return prisma.campaign.findFirst({
    where: owned(id, organizationId),
    select: { id: true, name: true, assetCode: true, amountPerLink: true, linkCount: true },
  })
}
