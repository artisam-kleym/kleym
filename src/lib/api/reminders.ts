/**
 * Reminders to recipients who have not claimed (#78).
 *
 * The one thing to be clear about first: a reminder CANNOT contain the claim
 * link. The URL transits Kleym exactly once, in memory, on the way to the mail
 * provider, and the job payload is deleted on completion (SPEC.md §6.5) — so
 * by the time a reminder is due, Kleym does not have it and must not try to
 * reconstruct it. A reminder says who sent what, when it expires, and tells
 * the recipient to open the ORIGINAL message. That is honest and it is useful,
 * and it keeps the seed-handling properties `verify-email.ts` proves.
 *
 * Only email-delivered links are ever reminded: no `Delivery` row means no
 * address, and Kleym never saw that URL. Bounded the way #43 bounds the other
 * maintenance passes, and rate-limited PER RECIPIENT — a sender with three
 * reminder points on a campaign re-run monthly can generate a lot of mail to
 * one address, and looking like a spammer is the fastest way to lose delivery.
 */
import { createHash } from 'node:crypto'
import Decimal from 'decimal.js'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { redis } from '@/lib/redis/client'
import { deliveryJobs, enqueueReminder } from '@/lib/queue/email'
import { redisPassCursor, type PassCursor } from '@/lib/queue/pass-cursor'
import { recordPassReport, type PassReportSink } from '@/lib/queue/pass-report'
import { REMINDER_INTERVAL_MS } from '@/lib/queue/schedule'
import { emitWebhook } from '@/lib/webhooks/emit'
import { outstandingLinks } from './suspend'

const DAY_MS = 86_400_000

/** Deliveries one pass reads at most. One email enqueue per due delivery, no Horizon. */
export const REMINDER_PASS_LIMIT = 500

/** No address hears from Kleym about ANY link more often than this. */
export const PER_RECIPIENT_FLOOR_MS = 24 * 60 * 60_000

/** `campaign.expiring_soon` goes out this long before expiry, or at the first reminder point if earlier. */
export const EXPIRING_SOON_DAYS = 7

/**
 * Which reminder points are due for one delivery, pure. A point `d` is due
 * once `now >= expiresAt - d days`, unless it was already sent — and the pass
 * sends ONE message per delivery per run (the latest due point) and records
 * EVERY due point as sent, so a recipient whose campaign has three points
 * that all fell due while the worker was down gets one email, not three —
 * and not one a day for three days either.
 */
export function duePoints(
  reminderDaysBefore: number[],
  expiresAt: Date,
  alreadySent: number[],
  now: Date,
  /** When the claim email itself went out: a point that had already passed by then is not a reminder, it is a repeat. */
  sentAt: Date | null = null,
): number[] {
  const sent = new Set(alreadySent)
  return reminderDaysBefore
    .filter((days) => Number.isInteger(days) && days > 0 && !sent.has(days))
    .filter((days) => now.getTime() >= expiresAt.getTime() - days * DAY_MS)
    // A 14-day point on a campaign that was 5 days out when the email went
    // out would fall "due" on the next pass — forty minutes after the claim
    // email. That is not a reminder. Only points still ahead at send count.
    .filter((days) => sentAt === null || expiresAt.getTime() - days * DAY_MS > sentAt.getTime())
    .sort((a, b) => a - b)
}

/** The one point to send now: the latest that is due (closest to expiry). */
export function pointToSend(due: number[]): number | null {
  return due.length === 0 ? null : due[0]!
}

export interface ReminderReport {
  checked: number
  reminded: number
  /** Skipped because this address heard from Kleym within the floor. */
  throttled: number
  expiringSoon: number
  remaining: number
}

export interface ReminderDeps {
  /** True if `email` may be mailed now; reserves the floor when it is. */
  allowRecipient: (email: string, now: Date) => Promise<boolean>
  /** Gives the floor back when the enqueue failed, so the address is not silently blocked for a day. */
  releaseRecipient: (email: string) => Promise<void>
  enqueue: typeof enqueueReminder
}

/** Hashed, never the address: the limiter key is a Redis key someone can list. */
function recipientKey(email: string): string {
  return `reminder:recipient:${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}`
}

/**
 * The claim email counts against the same floor (deliver.ts calls this):
 * "one email per address per day" includes the first one. Overwrites rather
 * than reserves — the claim email is never throttled, only what follows it.
 */
export async function noteRecipientMailed(email: string): Promise<void> {
  await redis.set(recipientKey(email), '1', 'PX', PER_RECIPIENT_FLOOR_MS).catch((error: unknown) => {
    logger.warn({ reason: error instanceof Error ? error.message : 'unknown' }, 'could not note the claim email against the reminder floor')
  })
}

const LIVE: ReminderDeps = {
  allowRecipient: async (email) => {
    // SET NX with the floor as TTL: one write, atomic, fails closed on a taken key.
    const set = await redis.set(recipientKey(email), '1', 'PX', PER_RECIPIENT_FLOOR_MS, 'NX')
    return set === 'OK'
  },
  releaseRecipient: async (email) => {
    await redis.del(recipientKey(email))
  },
  enqueue: enqueueReminder,
}

/** The reminder job for one delivery and point, if the enqueue landed after all; removed with its dedup key. */
async function removeQueuedReminder(deliveryId: string, point: number): Promise<void> {
  const queue = deliveryJobs()
  const dedupe = `remind:${deliveryId}:${point}`
  try {
    const jobId = await queue.getDeduplicationJobId(dedupe)
    if (jobId) await (await queue.getJob(jobId))?.remove()
    await queue.removeDeduplicationKey(dedupe)
  } catch (error) {
    logger.error({ deliveryId, reason: error instanceof Error ? error.message : 'unknown' }, 'could not remove a possibly-queued reminder after rollback')
  }
}

export interface ReminderOptions {
  limit?: number
  cursor?: PassCursor
  report?: PassReportSink
}

const cursorForScheduledPass = redisPassCursor('pass:cursor:reminders')

/**
 * One bounded pass. Candidates are deliveries whose link is still ACTIVE and
 * not suspended, whose campaign has reminder points, is not suspended and has
 * not expired, and whose email was actually sent and not yet redacted.
 */
export async function sendReminders(
  deps: ReminderDeps = LIVE,
  now: Date = new Date(),
  { limit = REMINDER_PASS_LIMIT, cursor = cursorForScheduledPass, report: sink = recordPassReport }: ReminderOptions = {},
): Promise<ReminderReport> {
  const report: ReminderReport = { checked: 0, reminded: 0, throttled: 0, expiringSoon: 0, remaining: 0 }

  const candidate: Prisma.DeliveryWhereInput = {
    sentAt: { not: null },
    email: { not: null },
    link: {
      status: 'ACTIVE',
      suspendedAt: null,
      campaign: { suspendedAt: null, expiresAt: { gt: now }, reminderDaysBefore: { isEmpty: false } },
    },
  }
  const page = (after: string | null) =>
    prisma.delivery.findMany({
      where: after ? { ...candidate, id: { gt: after } } : candidate,
      orderBy: { id: 'asc' },
      take: limit,
      select: {
        id: true, email: true, sentAt: true, reminderPoints: true, remindedAt: true,
        link: {
          select: {
            id: true,
            // What THIS link pays (#73), like the delivery email.
            amount: true,
            campaign: { select: { id: true, name: true, assetCode: true, expiresAt: true, reminderDaysBefore: true, user: { select: { username: true } } } },
          },
        },
      },
    })

  const after = await cursor.get()
  let candidates = await page(after)
  if (candidates.length === 0 && after) candidates = await page(null)

  for (const delivery of candidates) {
    report.checked += 1
    const campaign = delivery.link.campaign
    const due = duePoints(campaign.reminderDaysBefore, campaign.expiresAt, delivery.reminderPoints, now, delivery.sentAt)
    const point = pointToSend(due)
    if (point === null || !delivery.email) continue

    let reserved = false
    let recorded = false
    try {
      if (!(await deps.allowRecipient(delivery.email, now))) {
        report.throttled += 1
        continue
      }
      reserved = true
      /*
       * Recorded BEFORE the enqueue, not after: if the record failed after a
       * successful enqueue, the queued reminder would still send, its dedup
       * key would go with it on completion, and the next pass would queue a
       * second copy. This way the only thing left to undo is the record.
       * EVERY due point is recorded, not only the one sent — the one message
       * stands in for all of them, or the stale points would each earn a
       * daily email later.
       */
      await prisma.delivery.update({
        where: { id: delivery.id },
        data: { reminderPoints: { push: due }, remindedAt: now },
      })
      recorded = true
      await deps.enqueue({
        kind: 'reminder',
        deliveryId: delivery.id,
        linkId: delivery.link.id,
        email: delivery.email,
        senderName: campaign.user.username,
        campaignName: campaign.name,
        amount: new Decimal(delivery.link.amount.toString()).toFixed(),
        assetCode: campaign.assetCode,
        expiresAt: campaign.expiresAt.toISOString(),
        sentAt: delivery.sentAt!.toISOString(),
        point,
      })
      report.reminded += 1
    } catch (error) {
      logger.error({ deliveryId: delivery.id, reason: error instanceof Error ? error.message : 'unknown' }, 'could not queue a reminder; continuing')
      // Nothing was queued: put the row back as it was so the points are due
      // again next pass, and give the floor back, or this address hears
      // nothing for a day and a 1-day point is never sent.
      if (recorded) {
        await prisma.delivery
          .update({ where: { id: delivery.id }, data: { reminderPoints: { set: delivery.reminderPoints }, remindedAt: delivery.remindedAt } })
          .catch((rollback: unknown) => logger.error({ deliveryId: delivery.id, reason: rollback instanceof Error ? rollback.message : 'unknown' }, 'could not roll back reminder points'))
        /*
         * "Nothing was queued" is what the throw says, not always what
         * happened: the job can be in Redis and the connection drop before
         * the acknowledgement arrives. With the points rolled back, that job
         * would send and — its dedup key gone on completion — the next pass
         * would queue a second copy. So the job is looked for and removed;
         * a job that is not there is the common case and costs one GET.
         */
        await removeQueuedReminder(delivery.id, point)
      }
      if (reserved) await deps.releaseRecipient(delivery.email).catch(() => undefined)
    }
  }

  const last = candidates.at(-1)
  if (candidates.length < limit || !last) {
    await cursor.set(null)
  } else {
    report.remaining = await prisma.delivery.count({ where: { ...candidate, id: { gt: last.id } } })
    await cursor.set(report.remaining > 0 ? last.id : null)
  }
  if (report.remaining > 0) {
    logger.warn({ checked: report.checked, remaining: report.remaining, limit }, 'reminder pass hit its limit before the end of its candidate set; the rest continue next run')
  }

  report.expiringSoon = await announceExpiringSoon(now)

  await sink({
    job: 'reminders',
    finishedAt: now.toISOString(),
    checked: report.checked,
    remaining: report.remaining,
    limit,
    intervalMs: REMINDER_INTERVAL_MS,
  })
  return report
}

/**
 * `campaign.expiring_soon`, once per campaign, when it is within
 * EXPIRING_SOON_DAYS (or its first reminder point, if earlier) of expiry and
 * still has unclaimed links. Bounded by campaign count, not link count.
 *
 * Not for a suspended campaign: its organisation already has
 * `campaign.suspended` with the outstanding figures, and "expiring soon"
 * would imply Kleym is still serving those links.
 *
 * Soonest expiry first. Rows outside their window are not marked and so
 * stay in the candidate set; without the order, 200 far-off campaigns could
 * fill the page every hour while one inside its window expired unannounced.
 */
export async function announceExpiringSoon(now: Date = new Date()): Promise<number> {
  const horizonMs = EXPIRING_SOON_DAYS * DAY_MS
  const campaigns = await prisma.campaign.findMany({
    where: {
      expiringSoonAt: null,
      suspendedAt: null,
      status: { in: ['ACTIVE', 'PARTIAL'] },
      expiresAt: { gt: now, lte: new Date(now.getTime() + 365 * DAY_MS) },
    },
    select: { id: true, organizationId: true, name: true, assetCode: true, expiresAt: true, reminderDaysBefore: true },
    orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    take: 200,
  })
  let announced = 0
  for (const campaign of campaigns) {
    const earliestPoint = Math.max(EXPIRING_SOON_DAYS, ...campaign.reminderDaysBefore)
    const window = Math.max(horizonMs, earliestPoint * DAY_MS)
    // Ordered by expiry: past the first campaign outside its window, the rest
    // are further out still — but each campaign's window is its own, so keep
    // looking rather than break.
    if (campaign.expiresAt.getTime() - now.getTime() > window) continue

    // The SUM of the outstanding links' own amounts (#73), like the suspend panel.
    const { count: outstanding, amount: outstandingAmount } = await outstandingLinks(campaign.id)
    const marked = await prisma.campaign.updateMany({ where: { id: campaign.id, expiringSoonAt: null }, data: { expiringSoonAt: now } })
    if (marked.count === 0 || outstanding === 0) continue
    await emitWebhook(campaign.organizationId, 'campaign.expiring_soon', {
      campaignId: campaign.id,
      outstanding,
      outstandingAmount,
      assetCode: campaign.assetCode,
      expiresAt: campaign.expiresAt.toISOString(),
    })
    announced += 1
  }
  return announced
}
