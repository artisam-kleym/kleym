/**
 * The stranded ephemeral account monitor. SPEC.md §3.3.2, §7.3.
 *
 * The two-transaction claim is not atomic. TX1 can land and TX2 never follow —
 * a closed tab, a rejected signature, a dropped connection — leaving an
 * ephemeral account on the ledger holding sponsored reserve.
 *
 * This DETECTS and REPORTS. It does not sweep, and calling it a sweeper would
 * imply a recovery it cannot perform: `AccountMerge` must be signed by the
 * ephemeral key, which exists only in the sender's CSV and the recipient's URL.
 * The same property that makes a database breach harmless makes this cleanup
 * impossible. `RevokeSponsorship` is no escape either — it moves the reserve
 * obligation to an account with a zero balance, which cannot meet it.
 *
 * No user funds are at risk. What is stranded is Kleym's own float, which every
 * other claim depends on, and it returns by itself when the link is eventually
 * claimed (a retry skips TX1, §3.3.2).
 */
import Decimal from 'decimal.js'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { baseReserve, horizon, loadClaimableBalance } from '@/lib/stellar/horizon'
import { requestReconcile } from '@/lib/queue/maintenance'
import { redisPassCursor, type PassCursor } from '@/lib/queue/pass-cursor'

/**
 * How long after TX1 an unfinished claim counts as stranded.
 *
 * A recipient who is mid-claim — reading the confirmation, approving in a
 * wallet — has an ephemeral account that exists and a claim that has not
 * finished, which is indistinguishable from an abandoned one at the instant it
 * happens. An hour is long enough that anything still outstanding is genuinely
 * abandoned rather than merely slow.
 *
 * A constant rather than an env var: SPEC.md §9.1 fixes the environment set,
 * and a knob nobody turns is a knob that drifts out of step with the docs.
 */
export const STRAND_AFTER_MS = 60 * 60 * 1000

/** An ephemeral account as the ledger holds it. */
export interface EphemeralAccount {
  /** Entries beyond the account itself — a trustline is one. */
  subentryCount: number
  /** Any asset the account holds a non-zero amount of. */
  nonZeroAssets: { asset: string; balance: string }[]
  /** When the ledger last touched this account: TX1's time, if abandoned. */
  lastActivity: Date
}

export type AccountReader = (publicKey: string) => Promise<EphemeralAccount | null>
export type BalanceChecker = (balanceId: string) => Promise<boolean>

/** Reads one ephemeral account. `null` means it is not on the ledger. */
export const readEphemeral: AccountReader = async (publicKey) => {
  try {
    const account = await horizon().loadAccount(publicKey)
    const record = account as unknown as {
      subentry_count?: number
      last_modified_time?: string
    }

    return {
      subentryCount: record.subentry_count ?? 0,
      nonZeroAssets: account.balances
        .filter((balance) => new Decimal(balance.balance).greaterThan(0))
        .map((balance) => ({
          asset: balance.asset_type === 'native' ? 'XLM' : `${(balance as { asset_code?: string }).asset_code ?? '?'}`,
          balance: balance.balance,
        })),
      // Falling back to the epoch would make a missing timestamp look ancient
      // and report a live claim as stranded, so it reads as brand new instead.
      lastActivity: record.last_modified_time ? new Date(record.last_modified_time) : new Date(),
    }
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 404 || (error as { name?: string })?.name === 'NotFoundError') return null
    throw error
  }
}

export const balanceStillExists: BalanceChecker = async (balanceId) =>
  (await loadClaimableBalance(balanceId)) !== null

export interface StrandedDeps {
  readAccount: AccountReader
  balanceExists: BalanceChecker
  reserve: () => Promise<Decimal>
  /** Asks reconciliation to look at a campaign whose row looks stale. */
  askReconcile: (campaignId: string) => Promise<void>
}

const LIVE: StrandedDeps = {
  readAccount: readEphemeral,
  balanceExists: balanceStillExists,
  reserve: baseReserve,
  askReconcile: (campaignId) => requestReconcile(campaignId),
}

export interface StrandedReport {
  checked: number
  stranded: number
  critical: number
  /** Rows that were stranded and are not any more. */
  resolved: number
  /** Handed to reconciliation because the claim had actually succeeded. */
  handedOff: number
  lockedXlm: string
  /**
   * Candidates this pass left for the next one because it hit `limit` first.
   * Reported and logged rather than hidden — see `WATCH_PASS_LIMIT`.
   */
  remaining: number
}

/**
 * Candidates one scheduled pass will read before stopping.
 *
 * The same shape as `RECONCILE_PASS_LIMIT` and for the same reason: one
 * serial Horizon read per link on a `*\/15 * * * *` schedule cannot cover
 * `MAX_LINKS_PER_CAMPAIGN` inside its own interval, so an unbounded pass
 * runs permanently behind with nothing saying so. Bounded, the shortfall is
 * a number in the report and a WARN in the log, and the cursor carries the
 * next pass on from here. Fifteen minutes buys three times reconcile's
 * budget at the same read rate.
 */
export const WATCH_PASS_LIMIT = 3_000

const cursorForScheduledPass = redisPassCursor('ephemeral-watch:cursor')

export interface WatchOptions {
  limit?: number
  cursor?: PassCursor
}

/**
 * The minimum balance an account must hold, in XLM.
 *
 * `(2 + subentries) × base_reserve` — two for the account itself, one per
 * subentry. At a 0.5 base reserve that is the 1.0 XLM SPEC.md §3.3.2 quotes,
 * or 1.5 with a trustline. Computed from the LIVE base reserve rather than a
 * constant, because the protocol value can change.
 */
export function lockedReserve(base: Decimal, subentryCount: number): Decimal {
  return base.times(2 + subentryCount)
}

/**
 * Walks every unfinished claim and reports the ones that are stranded.
 *
 * Idempotent by construction: each link's row is upserted on its primary key
 * and rows that are no longer stranded are deleted, so a second run in the
 * same minute produces the same table, not a second copy of it.
 */
export async function watchEphemerals(
  deps: StrandedDeps = LIVE,
  now: Date = new Date(),
  { limit = WATCH_PASS_LIMIT, cursor = cursorForScheduledPass }: WatchOptions = {},
): Promise<StrandedReport> {
  const report: StrandedReport = {
    checked: 0, stranded: 0, critical: 0, resolved: 0, handedOff: 0, lockedXlm: '0', remaining: 0,
  }

  /*
   * Candidates are links that have an on-chain balance and are not finished.
   * A CLAIMED link's ephemeral account was merged away by TX2; a PENDING one
   * never had a balance to claim in the first place.
   *
   * Read in id order (cuids are time-ordered: oldest first), at most `limit`
   * per pass, from wherever the previous pass stopped, wrapping at the end.
   */
  const candidate: Prisma.ClaimLinkWhereInput = { status: { in: ['ACTIVE', 'EXPIRED'] }, balanceId: { not: null } }
  const page = (after: string | null) =>
    prisma.claimLink.findMany({
      where: after ? { ...candidate, id: { gt: after } } : candidate,
      orderBy: { id: 'asc' },
      take: limit,
      select: { id: true, campaignId: true, ephemeralPublicKey: true, balanceId: true },
    })

  const after = await cursor.get()
  let candidates = await page(after)
  if (candidates.length === 0 && after) candidates = await page(null)

  const base = await deps.reserve()
  let locked = new Decimal(0)

  for (const link of candidates) {
    report.checked += 1
    try {
      const outcome = await inspect(link, deps, base, now)
      if (outcome === 'resolved') report.resolved += 1
      if (outcome === 'handed-off') report.handedOff += 1
      if (outcome === 'stranded' || outcome === 'critical') {
        report.stranded += 1
        if (outcome === 'critical') report.critical += 1
      }
    } catch (error) {
      // One unreadable account must not stop the sweep — the same reasoning as
      // the per-link isolation in lib/api/reconcile.ts.
      logger.error(
        { linkId: link.id, reason: error instanceof Error ? error.message : 'unknown' },
        'could not check this ephemeral account; continuing',
      )
    }
  }

  const last = candidates.at(-1)
  if (candidates.length < limit || !last) {
    await cursor.set(null)
  } else {
    report.remaining = await prisma.claimLink.count({ where: { ...candidate, id: { gt: last.id } } })
    await cursor.set(report.remaining > 0 ? last.id : null)
  }
  if (report.remaining > 0) {
    logger.warn(
      { checked: report.checked, remaining: report.remaining, limit },
      'ephemeral watch hit its limit before the end of its candidate set; the rest continue next run',
    )
  }

  /*
   * Rows whose link is no longer a candidate are cleared here, not in the loop.
   *
   * The loop only visits ACTIVE and EXPIRED links, so a link that reached
   * CLAIMED since the last run — a recipient finally coming back, which is the
   * ORDINARY resolution — would never be visited again and its row would sit
   * on the admin report forever, overstating locked float that had in fact
   * returned. Found by running the worker against real data, not by reading
   * this function: two rows survived every sweep because their links had been
   * settled in between.
   */
  const settled = await prisma.strandedAccount.deleteMany({
    where: { link: { status: { notIn: ['ACTIVE', 'EXPIRED'] } } },
  })
  report.resolved += settled.count

  const rows = await prisma.strandedAccount.findMany({ select: { lockedReserve: true } })
  for (const row of rows) locked = locked.plus(row.lockedReserve.toString())
  report.lockedXlm = locked.toString()

  logger.info({ ...report }, 'ephemeral watch completed')
  return report
}

type Outcome = 'not-stranded' | 'resolved' | 'handed-off' | 'stranded' | 'critical'

async function inspect(
  link: { id: string; campaignId: string; ephemeralPublicKey: string; balanceId: string | null },
  deps: StrandedDeps,
  base: Decimal,
  now: Date,
): Promise<Outcome> {
  const account = await deps.readAccount(link.ephemeralPublicKey)

  // No account means TX1 never landed, or TX2 merged it away. Either way
  // nothing is locked, and any earlier report is now wrong.
  if (!account) return (await clear(link.id)) ? 'resolved' : 'not-stranded'

  /*
   * The balance is gone but the row is not CLAIMED: the claim SUCCEEDED and
   * the database is behind. Reporting a strand here would be a lie about
   * Kleym's float, so it goes to reconciliation, whose job this is (§7.2).
   */
  if (!(await deps.balanceExists(link.balanceId!))) {
    await clear(link.id)
    await deps.askReconcile(link.campaignId)
    logger.info(
      { linkId: link.id, campaignId: link.campaignId },
      'claim had actually succeeded; handed to reconciliation',
    )
    return 'handed-off'
  }

  // Too recent to call abandoned — a recipient may be in their wallet.
  if (now.getTime() - account.lastActivity.getTime() < STRAND_AFTER_MS) {
    return (await clear(link.id)) ? 'resolved' : 'not-stranded'
  }

  const held = account.nonZeroAssets
  const critical = held.length > 0
  const reserve = lockedReserve(base, account.subentryCount)

  const detail = critical
    ? `This ephemeral account holds ${held.map((h) => `${h.balance} ${h.asset}`).join(', ')}. A claim applied partially — the funds moved but the account was not merged. This needs a person.`
    : `TX1 landed and TX2 never followed. ${reserve.toString()} XLM of sponsor reserve is locked here until this link is claimed. Kleym cannot recover it: the merge needs the ephemeral key, which Kleym does not hold.`

  if (critical) {
    logger.error(
      { linkId: link.id, campaignId: link.campaignId, account: link.ephemeralPublicKey, held },
      'ephemeral account holds a non-zero balance: a partially-applied claim',
    )
  }

  await prisma.strandedAccount.upsert({
    where: { linkId: link.id },
    create: {
      linkId: link.id,
      campaignId: link.campaignId,
      ephemeralPublicKey: link.ephemeralPublicKey,
      lockedReserve: reserve.toString(),
      critical,
      detail,
      lastLedgerActivity: account.lastActivity,
    },
    update: {
      lockedReserve: reserve.toString(),
      critical,
      detail,
      lastLedgerActivity: account.lastActivity,
    },
  })

  return critical ? 'critical' : 'stranded'
}

/** Removes a report that no longer holds. True if there was one. */
async function clear(linkId: string): Promise<boolean> {
  const { count } = await prisma.strandedAccount.deleteMany({ where: { linkId } })
  return count > 0
}

export interface StrandedSummary {
  count: number
  critical: number
  lockedXlm: string
  accounts: {
    linkId: string
    campaignId: string
    campaignName: string
    ephemeralPublicKey: string
    lockedReserve: string
    critical: boolean
    detail: string
    firstSeenAt: Date
  }[]
}

/** Everything `/admin` needs to show the locked float. */
export async function strandedSummary(): Promise<StrandedSummary> {
  const rows = await prisma.strandedAccount.findMany({
    orderBy: [{ critical: 'desc' }, { firstSeenAt: 'asc' }],
    select: {
      linkId: true, campaignId: true, ephemeralPublicKey: true, lockedReserve: true,
      critical: true, detail: true, firstSeenAt: true,
      campaign: { select: { name: true } },
    },
  })

  // Summed with Decimal, not Number: this is XLM, and AGENT.md §4.1 forbids
  // floating point for an amount even when it is only being displayed.
  const locked = rows.reduce((sum, row) => sum.plus(row.lockedReserve.toString()), new Decimal(0))

  return {
    count: rows.length,
    critical: rows.filter((row) => row.critical).length,
    lockedXlm: locked.toString(),
    accounts: rows.map((row) => ({
      linkId: row.linkId,
      campaignId: row.campaignId,
      campaignName: row.campaign.name,
      ephemeralPublicKey: row.ephemeralPublicKey,
      lockedReserve: row.lockedReserve.toString(),
      critical: row.critical,
      detail: row.detail,
      firstSeenAt: row.firstSeenAt,
    })),
  }
}
