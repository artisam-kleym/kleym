/**
 * The lifecycle of the one piece of recipient PII Kleym holds: the address a
 * link was emailed to. Issue #50.
 *
 * Recipients are not Kleym's users and never agreed to anything — a sender
 * uploaded their address. So the address is REDACTED, not kept: by the
 * retention sweep once the link or campaign has settled and the period has
 * run, or at once on an erasure request by address. Redaction nulls the
 * address and the OTP material and sets `redactedAt`; `sentAt`/`openedAt`
 * survive as the claim that a delivery happened, and nothing on ClaimLink is
 * touched — the ledger record of the money (`claimTxHash`) is evidence, not
 * PII, and AGENT.md §4.2 keeps the chain authoritative over it.
 *
 * Neither path ever puts the address in an audit row or a log line: the
 * scrubber refuses `email` keys, and this module logs counts and ids only.
 */
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { logger } from '@/lib/config/logger'
import { deliveryJobs } from '@/lib/queue/email'
import { redisPassCursor, type PassCursor } from '@/lib/queue/pass-cursor'
import { recordPassReport, type PassReportSink } from '@/lib/queue/pass-report'
import { RETENTION_INTERVAL_MS } from '@/lib/queue/schedule'
import { recordAudit } from './audit'

/**
 * How long an address is kept after its link or campaign settles.
 *
 * A constant, not an env var (SPEC.md §9.1 fixes the environment set). The
 * period exists so a sender can answer "did this person get their link?"
 * for a while after the campaign ends; ninety days is long enough for that
 * question and short enough that "we keep it forever" is not the answer on
 * a questionnaire. docs/data-handling.md states it; change both together.
 */
export const DELIVERY_RETENTION_DAYS = 90
export const DELIVERY_RETENTION_MS = DELIVERY_RETENTION_DAYS * 24 * 60 * 60 * 1000

/** Rows one scheduled pass will read. Same shape as the other bounded jobs (#43). */
export const RETENTION_PASS_LIMIT = 2_000

const REDACTION = { email: null, otpHash: null, otpExpires: null, otpAttempts: 0 } as const

/**
 * A delivery is due for redaction when its address is still held and either
 * its link settled (claimed, reclaimed, failed) or its campaign settled
 * (expired, reclaimed, cancelled) at least the retention period ago.
 */
export function retentionWhere(now: Date): Prisma.DeliveryWhereInput {
  const cutoff = new Date(now.getTime() - DELIVERY_RETENTION_MS)
  return {
    email: { not: null },
    OR: [
      { link: { status: { in: ['CLAIMED', 'RECLAIMED'] }, claimedAt: { lte: cutoff } } },
      { link: { status: 'FAILED', updatedAt: { lte: cutoff } } },
      { link: { campaign: { status: { in: ['EXPIRED', 'RECLAIMED', 'CANCELLED'] }, expiresAt: { lte: cutoff } } } },
    ],
  }
}

export interface RetentionReport {
  checked: number
  redacted: number
  remaining: number
}

export interface RetentionOptions {
  limit?: number
  cursor?: PassCursor
  report?: PassReportSink
}

const cursorForScheduledPass = redisPassCursor('delivery-retention:cursor')

/**
 * One bounded pass of the retention sweep. Reads at most `limit` due rows
 * in id order from where the last pass stopped, redacts them, and reports
 * what it did not reach — in the log and on /admin/reconciliation, like the
 * other maintenance passes.
 */
export async function sweepDeliveryRetention(
  now: Date = new Date(),
  { limit = RETENTION_PASS_LIMIT, cursor = cursorForScheduledPass, report: sink = recordPassReport }: RetentionOptions = {},
): Promise<RetentionReport> {
  const due = retentionWhere(now)
  const page = (after: string | null) =>
    prisma.delivery.findMany({
      where: after ? { ...due, id: { gt: after } } : due,
      orderBy: { id: 'asc' },
      take: limit,
      select: { id: true },
    })

  const after = await cursor.get()
  let rows = await page(after)
  if (rows.length === 0 && after) rows = await page(null)

  const report: RetentionReport = { checked: rows.length, redacted: 0, remaining: 0 }
  if (rows.length > 0) {
    const { count } = await prisma.delivery.updateMany({
      where: { id: { in: rows.map((r) => r.id) }, email: { not: null } },
      data: { ...REDACTION, redactedAt: now },
    })
    report.redacted = count
    // Audited as a count. Never an address, never a list of them.
    await recordAudit({
      userId: null,
      action: 'privacy.retention',
      entityType: 'delivery',
      metadata: { redacted: count, retentionDays: DELIVERY_RETENTION_DAYS },
      ip: null,
    })
  }

  const last = rows.at(-1)
  if (rows.length < limit || !last) {
    await cursor.set(null)
  } else {
    report.remaining = await prisma.delivery.count({ where: { ...due, id: { gt: last.id } } })
    await cursor.set(report.remaining > 0 ? last.id : null)
  }
  if (report.remaining > 0) {
    logger.warn({ ...report, limit }, 'delivery retention pass hit its limit before the end of its candidate set; the rest continue next run')
  }
  await sink({
    job: 'delivery-retention',
    finishedAt: now.toISOString(),
    checked: report.checked,
    remaining: report.remaining,
    limit,
    intervalMs: RETENTION_INTERVAL_MS,
  })
  logger.info(report, 'delivery retention pass completed')
  return report
}

export const eraseSchema = z.object({ email: z.email().max(320) }).strict()

/**
 * Erasure by address: every delivery to it, across every campaign, in one
 * statement — the `@@index([email])` exists for exactly this lookup. Any
 * email still waiting in the queue for those deliveries is removed too, so
 * the address does not go out after the request that erased it.
 *
 * Returns only a count. The address reaches the audit row and the log as
 * nothing at all.
 */
export async function eraseByEmail(actorId: string, email: string, ip: string | null): Promise<{ redacted: number }> {
  const address = email.trim().toLowerCase()
  const targets = await prisma.delivery.findMany({
    where: { email: { equals: address, mode: 'insensitive' } },
    select: { id: true },
  })
  if (targets.length === 0) {
    await recordAudit({ userId: actorId, action: 'privacy.erasure', entityType: 'delivery', metadata: { redacted: 0 }, ip })
    return { redacted: 0 }
  }

  // Queued sends first, so a job cannot mail the address between the
  // redaction and its own removal. Jobs are deduplicated on the delivery
  // id (lib/queue/email.ts), which is how one is found again here.
  const queue = deliveryJobs()
  for (const target of targets) {
    const dedupe = `deliver:${target.id}`
    const jobId = await queue.getDeduplicationJobId(dedupe).catch(() => null)
    if (jobId) {
      const job = await queue.getJob(jobId)
      await job?.remove().catch(() => undefined)
    }
    await queue.removeDeduplicationKey(dedupe).catch(() => undefined)
  }

  const { count } = await prisma.delivery.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { ...REDACTION, redactedAt: new Date() },
  })
  await recordAudit({
    userId: actorId,
    action: 'privacy.erasure',
    entityType: 'delivery',
    metadata: { redacted: count },
    ip,
  })
  logger.info({ actorId, redacted: count }, 'erasure request honoured')
  return { redacted: count }
}
