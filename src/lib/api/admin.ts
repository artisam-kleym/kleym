/**
 * Admin-only reads and actions. SPEC.md §5.4.
 *
 * Every function here assumes the caller has ALREADY been checked as an admin
 * — `requireAdmin` does that, and it is what routes call first. Nothing in
 * this module is protected by being hard to reach from the UI (criterion 2:
 * hiding a nav item is not access control).
 */
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { getSessionUser } from '@/lib/auth/session'
import { recordAudit } from './audit'

export interface AdminUserRow {
  id: string
  username: string
  role: string
  isActive: boolean
  createdAt: Date
  lockedUntil: Date | null
  /** Decided here, not in render: reading the clock during render is impure. */
  isLocked: boolean
  campaigns: number
  sessions: number
}

export async function listUsers(): Promise<AdminUserRow[]> {
  const now = Date.now()
  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true, username: true, role: true, isActive: true,
      createdAt: true, lockedUntil: true,
      _count: { select: { campaigns: true, sessions: true } },
    },
  })

  return users.map((user) => ({
    id: user.id,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    lockedUntil: user.lockedUntil,
    isLocked: user.lockedUntil !== null && user.lockedUntil.getTime() > now,
    campaigns: user._count.campaigns,
    sessions: user._count.sessions,
  }))
}

export type AdminOutcome =
  | { kind: 'ok'; sessionsEnded: number }
  | { kind: 'not-found' }
  | { kind: 'conflict'; detail: string }

/**
 * Activates or deactivates a user.
 *
 * Deactivation DELETES their sessions rather than relying on the `isActive`
 * check in `getSessionUser`. That check already blocks the next request, so
 * this is belt and braces — but the belt matters: a session row that is
 * merely inert still exists, still appears in a session count, and would come
 * back to life the moment the account is reactivated. Deactivation should
 * mean signed out, not paused.
 */
export async function setUserActive(
  actorId: string,
  targetId: string,
  isActive: boolean,
  ip: string | null,
): Promise<AdminOutcome> {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, username: true, isActive: true, role: true },
  })
  if (!target) return { kind: 'not-found' }

  /*
   * An admin cannot deactivate themselves.
   *
   * Not a safety rail for its own sake: doing so signs you out mid-action and
   * can leave a deployment with no reachable admin at all, which is only
   * recoverable from the database.
   */
  if (!isActive && target.id === actorId) {
    return { kind: 'conflict', detail: 'You cannot deactivate your own account.' }
  }

  if (target.isActive === isActive) {
    return { kind: 'conflict', detail: `${target.username} is already ${isActive ? 'active' : 'deactivated'}.` }
  }

  const [, sessions] = await prisma.$transaction([
    prisma.user.update({ where: { id: targetId }, data: { isActive } }),
    isActive
      ? prisma.session.deleteMany({ where: { userId: targetId, expiresAt: { lt: new Date() } } })
      : prisma.session.deleteMany({ where: { userId: targetId } }),
  ])

  await recordAudit({
    userId: actorId,
    action: isActive ? 'user.activate' : 'user.deactivate',
    entityType: 'user',
    entityId: targetId,
    metadata: { username: target.username, sessionsEnded: sessions.count },
    ip,
  })

  logger.info(
    { actorId, targetId, isActive, sessionsEnded: sessions.count },
    isActive ? 'user activated' : 'user deactivated',
  )

  return { kind: 'ok', sessionsEnded: sessions.count }
}

export interface AdminCampaignRow {
  id: string
  name: string
  owner: string
  status: string
  assetCode: string
  amountPerLink: string
  linkCount: number
  claimed: number
  expiresAt: Date
  createdAt: Date
}

/** Every campaign, whoever owns it. SPEC.md §5.4. */
export async function listAllCampaigns(limit = 200): Promise<AdminCampaignRow[]> {
  const campaigns = await prisma.campaign.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: {
      id: true, name: true, status: true, assetCode: true, amountPerLink: true,
      linkCount: true, expiresAt: true, createdAt: true,
      user: { select: { username: true } },
      _count: { select: { links: true } },
    },
  })

  const claimed = await prisma.claimLink.groupBy({
    by: ['campaignId'],
    where: { campaignId: { in: campaigns.map((c) => c.id) }, status: 'CLAIMED' },
    _count: { _all: true },
  })
  const byCampaign = new Map(claimed.map((row) => [row.campaignId, row._count._all]))

  return campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    owner: campaign.user.username,
    status: campaign.status,
    assetCode: campaign.assetCode,
    amountPerLink: campaign.amountPerLink.toString(),
    linkCount: campaign.linkCount,
    claimed: byCampaign.get(campaign.id) ?? 0,
    expiresAt: campaign.expiresAt,
    createdAt: campaign.createdAt,
  }))
}

/**
 * The admin check, for API handlers.
 *
 * Returns 404 rather than 403 for a signed-in non-admin, matching the layout:
 * "forbidden" confirms the route exists, "not found" does not.
 */
export async function requireAdmin(): Promise<
  { user: { id: string; username: string }; response?: never } | { user?: never; response: Response }
> {
  const user = await getSessionUser()
  if (!user) {
    return { response: new Response(null, { status: 401 }) }
  }
  if (user.role !== 'ADMIN') {
    return { response: new Response(null, { status: 404 }) }
  }
  return { user: { id: user.id, username: user.username } }
}
