/**
 * The signals behind /status and the observable gauges. Issue #53.
 *
 * Every reading here is LIVE — the same probes /api/ready runs, the queues
 * as BullMQ holds them, the last bounded-pass reports, the sponsor float
 * and the stranded reserve — so a degraded dependency shows within one
 * collection or one page load, not after a cache expires. The page caches
 * the snapshot for STATUS_TTL_MS in memory only to bound the load a public
 * page can put on the dependencies it reports.
 *
 * Two audiences. The PUBLIC snapshot (`statusSnapshot`) is components and
 * states — operational / degraded / down — and nothing else: no counts, no
 * queue depths, no "sponsor below threshold", no "N accounts need an
 * operator". A sponsor running low is exactly the signal someone draining
 * the float through claims would want, and a queue depth is aggregate tenant
 * activity and a live read-out of whether an incident is working. Those
 * numbers are for /admin (`operatorStatus`) and the metrics, where an
 * operator reads them. Why a component is degraded stays in the log (see
 * the note on /api/ready).
 */
import Decimal from 'decimal.js'
import { env } from '@/lib/config/env'
import { prisma } from '@/lib/db/client'
import { redis } from '@/lib/redis/client'
import { QUEUE } from '@/lib/queue/connection'
import { batchConfirmQueue } from '@/lib/queue/batch-confirm'
import { deliveryJobs } from '@/lib/queue/email'
import { ephemeralWatchJobs, expiryJobs, reconcileJobs, retentionJobs } from '@/lib/queue/maintenance'
import { lastPassReports, type PassJob } from '@/lib/queue/pass-report'
import { sponsorStatuses } from '@/lib/api/sponsor-status'
import type { SpendableReader } from '@/lib/stellar/sponsors'
import type { DependencyReading, PassReading, QueueReading, SponsorReading, StrandedReading } from './metrics'

/** Bounded so a hung dependency cannot hold a probe open. Same bound as /api/ready. */
export const PROBE_TIMEOUT_MS = 3_000
export const STATUS_TTL_MS = 15_000

function withTimeout<T>(work: Promise<T>, name: string, ms = PROBE_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${name} did not answer in ${ms}ms`)), ms)),
  ])
}

export interface Probe {
  name: DependencyReading['dependency']
  ok: boolean
  latencyMs: number
  /** For the log only — never for a response body. */
  detail: string
}

async function probe(name: Probe['name'], work: () => Promise<unknown>): Promise<Probe> {
  const started = Date.now()
  try {
    await withTimeout(Promise.resolve(work()), name)
    return { name, ok: true, latencyMs: Date.now() - started, detail: 'ok' }
  } catch (error) {
    return { name, ok: false, latencyMs: Date.now() - started, detail: error instanceof Error ? error.message : 'unreachable' }
  }
}

/** Postgres, Redis and Horizon, each within the bound. Shared with /api/ready. */
export function probeDependencies(): Promise<Probe[]> {
  return Promise.all([
    probe('postgres', () => prisma.$queryRaw`SELECT 1`),
    probe('redis', () => redis.ping()),
    probe('horizon', async () => {
      const response = await fetch(env.HORIZON_URL, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
    }),
  ])
}

export async function dependencyReadings(): Promise<DependencyReading[]> {
  return (await probeDependencies()).map((p) => ({ dependency: p.name, up: p.ok }))
}

/** Depth and the oldest waiting job per queue — a worker that died quietly shows as both growing. */
export async function queueReadings(now: Date = new Date()): Promise<QueueReading[]> {
  const queues = [batchConfirmQueue(), deliveryJobs(), reconcileJobs(), expiryJobs(), ephemeralWatchJobs(), retentionJobs()]
  return Promise.all(
    queues.map(async (q) => {
      const counts = await withTimeout(q.getJobCounts('waiting', 'active', 'delayed', 'failed'), q.name)
      const [oldest] = await withTimeout(q.getWaiting(0, 0), q.name)
      const oldestWaitingSeconds = oldest?.timestamp ? Math.max(0, (now.getTime() - oldest.timestamp) / 1000) : 0
      return {
        queue: q.name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        oldestWaitingSeconds,
      }
    }),
  )
}

export async function sponsorReadings(read?: SpendableReader): Promise<SponsorReading[]> {
  const statuses = await withTimeout(sponsorStatuses(read), 'sponsors', PROBE_TIMEOUT_MS * 2)
  return statuses.map((s) => ({
    index: s.index,
    publicKey: s.publicKey,
    spendable: s.spendable === null ? null : Number(s.spendable),
    runwayDays: s.runwayDays === null ? null : Number(s.runwayDays),
  }))
}

export async function strandedReading(): Promise<StrandedReading> {
  const [all, critical] = await Promise.all([
    prisma.strandedAccount.aggregate({ _count: { _all: true }, _sum: { lockedReserve: true } }),
    prisma.strandedAccount.count({ where: { critical: true } }),
  ])
  return {
    accounts: all._count._all,
    reserve: Number(new Decimal(all._sum.lockedReserve?.toString() ?? '0').toFixed(7)),
    critical,
  }
}

export interface PassStatus extends PassReading {
  finishedAt: string | null
  /** True when the last report is older than two intervals — the job is not running. */
  stale: boolean
}

export async function passReadings(now: Date = new Date()): Promise<PassStatus[]> {
  const reports = await lastPassReports()
  const jobs: PassJob[] = ['reconcile', 'ephemeral-watch', 'delivery-retention']
  return jobs.map((job) => {
    const r = reports[job]
    return {
      job,
      remaining: r?.remaining ?? 0,
      finishedAt: r?.finishedAt ?? null,
      stale: !r || now.getTime() - new Date(r.finishedAt).getTime() > 2 * r.intervalMs,
    }
  })
}

/* ── the public snapshot ────────────────────────────────────────────────── */

export type ComponentState = 'operational' | 'degraded' | 'down'

/** What the outside sees. Names and states only. */
export interface StatusSnapshot {
  generatedAt: string
  overall: ComponentState
  components: { name: string; state: ComponentState; note: string }[]
}

/** What /admin sees: the same components, plus the numbers behind them. */
export interface OperatorStatus extends StatusSnapshot {
  queues: { queue: string; waiting: number; active: number; failed: number; oldestWaitingSeconds: number }[]
  passes: { job: string; state: ComponentState; remaining: number; finishedAt: string | null }[]
  sponsors: { index: number; low: boolean; unreadable: boolean; runwayDays: number | null }[]
  stranded: StrandedReading | null
}

const COMPONENT_LABEL: Record<Probe['name'], string> = {
  postgres: 'Database',
  redis: 'Queue and cache',
  horizon: 'Stellar network (Horizon)',
}

/** A queue whose oldest job has waited this long has no worker draining it. */
const QUEUE_STALL_SECONDS = 120

async function settle<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work()
  } catch {
    return null
  }
}

/** Scripts stub the sponsor balance reader; everything else is read as it is. */
export async function computeOperatorStatus(now: Date = new Date(), deps: { sponsorRead?: SpendableReader } = {}): Promise<OperatorStatus> {
  const [dependencies, queues, passes, sponsors, stranded] = await Promise.all([
    probeDependencies(),
    settle(() => queueReadings(now)),
    settle(() => passReadings(now)),
    settle(() => sponsorReadings(deps.sponsorRead)),
    settle(strandedReading),
  ])

  // Notes are generic by design: they must read the same to an outsider
  // whether the cause is a low float or a dead worker.
  const components: StatusSnapshot['components'] = dependencies.map((p) => ({
    name: COMPONENT_LABEL[p.name],
    state: p.ok ? 'operational' : 'down',
    note: p.ok ? 'answering' : 'not answering',
  }))

  const stalled = (queues ?? []).some((q) => q.oldestWaitingSeconds > QUEUE_STALL_SECONDS)
  components.push({
    name: 'Background workers',
    state: queues === null ? 'down' : stalled ? 'degraded' : 'operational',
    note: queues === null ? 'queues unreadable' : stalled ? 'jobs are waiting longer than expected' : 'draining',
  })

  const lowSponsor = (sponsors ?? []).some((s) => s.spendable !== null && s.spendable < env.SPONSOR_MIN_BALANCE_ALERT)
  const noSponsor = sponsors !== null && sponsors.length > 0 && sponsors.every((s) => s.spendable === null)
  components.push({
    name: 'Claim sponsorship',
    state: sponsors === null || noSponsor || lowSponsor ? 'degraded' : 'operational',
    note: sponsors === null || noSponsor || lowSponsor ? 'reduced capacity' : 'operational',
  })

  const passStale = (passes ?? []).some((p) => p.stale)
  const passBehind = (passes ?? []).some((p) => p.remaining > 0)
  components.push({
    name: 'Ledger reconciliation',
    state: passStale || (stranded?.critical ?? 0) > 0 ? 'degraded' : passBehind ? 'degraded' : 'operational',
    note: passStale ? 'a scheduled pass has not run' : (stranded?.critical ?? 0) > 0 || passBehind ? 'catching up' : 'current',
  })

  const passStates: OperatorStatus['passes'] = (passes ?? []).map((p) => ({
    job: p.job,
    state: p.stale ? 'degraded' : p.remaining > 0 ? 'degraded' : 'operational',
    remaining: p.remaining,
    finishedAt: p.finishedAt,
  }))

  const states = components.map((c) => c.state)
  const overall: ComponentState = states.includes('down') ? 'down' : states.includes('degraded') ? 'degraded' : 'operational'

  return {
    generatedAt: now.toISOString(),
    overall,
    components,
    queues: (queues ?? []).map((q) => ({ queue: q.queue, waiting: q.waiting, active: q.active, failed: q.failed, oldestWaitingSeconds: Math.round(q.oldestWaitingSeconds) })),
    passes: passStates,
    sponsors: (sponsors ?? []).map((s) => ({ index: s.index, low: s.spendable !== null && s.spendable < env.SPONSOR_MIN_BALANCE_ALERT, unreadable: s.spendable === null, runwayDays: s.runwayDays })),
    stranded,
  }
}

/** The public projection: components and states, nothing counted. */
export function publicStatus(full: OperatorStatus): StatusSnapshot {
  return { generatedAt: full.generatedAt, overall: full.overall, components: full.components }
}

/** Public snapshot from a fresh computation — scripts pass a stubbed sponsor reader. */
export async function computeStatus(now: Date = new Date(), deps: { sponsorRead?: SpendableReader } = {}): Promise<StatusSnapshot> {
  return publicStatus(await computeOperatorStatus(now, deps))
}

let cached: { at: number; full: OperatorStatus; public?: StatusSnapshot } | undefined

async function cachedStatus(now: Date): Promise<OperatorStatus> {
  if (cached && now.getTime() - cached.at < STATUS_TTL_MS) return cached.full
  const full = await computeOperatorStatus(now)
  cached = { at: now.getTime(), full }
  return full
}

/** The PUBLIC snapshot, at most STATUS_TTL_MS old. */
export async function statusSnapshot(now: Date = new Date()): Promise<StatusSnapshot> {
  const full = await cachedStatus(now)
  return (cached!.public ??= publicStatus(full))
}

/** The operator's view, same cache. Only ever rendered behind /admin. */
export function operatorStatus(now: Date = new Date()): Promise<OperatorStatus> {
  return cachedStatus(now)
}

export const QUEUE_NAMES = Object.values(QUEUE)
