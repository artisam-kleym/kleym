/**
 * The metric set. Issue #53.
 *
 * Every instrument here corresponds to a failure this system has already met
 * or documented — see docs/observability.md for the table. Labels go through
 * `safeAttributes`, the same allowlist spans use. Without an SDK registered
 * every call is a no-op (telemetry.ts turns them on).
 */
import { metrics, type Attributes, type BatchObservableResult, type Observable } from '@opentelemetry/api'
import { safeAttributes } from './attributes'

export const METRIC = {
  claimOutcomes: 'kleym.claim.outcomes',
  batchConfirmLatency: 'kleym.batch.confirm.latency',
  jobDuration: 'kleym.job.duration',
  queueDepth: 'kleym.queue.depth',
  queueOldestWaiting: 'kleym.queue.oldest_waiting',
  reconcilePasses: 'kleym.reconcile.passes',
  reconcileRemaining: 'kleym.reconcile.remaining',
  sponsorSpendable: 'kleym.sponsor.spendable',
  sponsorRunway: 'kleym.sponsor.runway',
  strandedReserve: 'kleym.stranded.reserve',
  strandedAccounts: 'kleym.stranded.accounts',
  rateLimitRejections: 'kleym.ratelimit.rejections',
  dependencyUp: 'kleym.dependency.up',
} as const

const meter = () => metrics.getMeter('kleym')

function labels(attrs: Record<string, unknown>): Attributes {
  return safeAttributes(attrs).attributes
}

/* ── counters and histograms: recorded at the point of the event ────────── */

export type ClaimPhase = 'resolve' | 'quote' | 'materialise' | 'claim' | 'submit'

/** One per claim call, split by phase and outcome — the ledger-boundary wait failing shows as `submit`/`unavailable`. */
export function recordClaimOutcome(phase: ClaimPhase, outcome: string): void {
  meter().createCounter(METRIC.claimOutcomes, { description: 'Claim calls by phase and outcome' }).add(1, labels({ phase, outcome }))
}

/** Seconds from a batch's submission to its confirmation on the ledger. */
export function recordBatchConfirmLatency(seconds: number, network: string): void {
  meter().createHistogram(METRIC.batchConfirmLatency, { unit: 's', description: 'Batch submit-to-confirm latency' }).record(seconds, labels({ network }))
}

/** Seconds a job ran, by queue and outcome. */
export function recordJobDuration(queue: string, outcome: 'completed' | 'failed', seconds: number): void {
  meter().createHistogram(METRIC.jobDuration, { unit: 's', description: 'Worker job duration' }).record(seconds, labels({ queue, outcome }))
}

/** A bounded pass finished: complete when it reached every candidate, otherwise how many it left. */
export function recordReconcilePass(job: string, remaining: number): void {
  meter().createCounter(METRIC.reconcilePasses, { description: 'Bounded maintenance passes by outcome' }).add(1, labels({ job, outcome: remaining === 0 ? 'complete' : 'incomplete' }))
}

/** A request refused by the limiter — by its own count, or because Redis was unreachable and it failed closed. */
export function recordRateLimitRejection(route: string, reason: 'limit' | 'unavailable'): void {
  meter().createCounter(METRIC.rateLimitRejections, { description: 'Rate-limited requests by route and reason' }).add(1, labels({ route, reason }))
}

/* ── observable gauges: read when the exporter collects ─────────────────── */

export interface QueueReading {
  queue: string
  waiting: number
  active: number
  delayed: number
  failed: number
  /** Age of the oldest waiting job, or 0 with nothing waiting. */
  oldestWaitingSeconds: number
}

export interface SponsorReading {
  index: number
  publicKey: string
  spendable: number | null
  runwayDays: number | null
}

export interface StrandedReading {
  accounts: number
  reserve: number
  critical: number
}

export interface PassReading {
  job: string
  remaining: number
}

export interface DependencyReading {
  dependency: 'postgres' | 'redis' | 'horizon'
  up: boolean
}

export interface ObservableSources {
  queues?: () => Promise<QueueReading[]>
  sponsors?: () => Promise<SponsorReading[]>
  stranded?: () => Promise<StrandedReading>
  passes?: () => Promise<PassReading[]>
  dependencies?: () => Promise<DependencyReading[]>
}

/**
 * Registers the gauges a collection reads live. Each source is guarded: a
 * reader that throws reports nothing for that cycle rather than failing the
 * export. Call once per process.
 */
export function registerObservables(sources: ObservableSources): void {
  const m = meter()
  // Named `apply`, not `use`: the React lint reads a `use(` call as the hook.
  const batch = <T>(instruments: Observable[], read: () => Promise<T>, apply: (result: BatchObservableResult, value: T) => void) => {
    m.addBatchObservableCallback(async (result) => {
      const value = await read().catch(() => undefined)
      // No reading this cycle; the dependency gauge says why.
      if (value !== undefined) apply(result, value)
    }, instruments)
  }

  if (sources.queues) {
    const depth = m.createObservableGauge(METRIC.queueDepth, { description: 'Jobs per queue and state' })
    const oldest = m.createObservableGauge(METRIC.queueOldestWaiting, { unit: 's', description: 'Age of the oldest waiting job' })
    batch([depth, oldest], sources.queues, (result, readings) => {
      for (const r of readings) {
        for (const state of ['waiting', 'active', 'delayed', 'failed'] as const) {
          result.observe(depth, r[state], labels({ queue: r.queue, state }))
        }
        result.observe(oldest, r.oldestWaitingSeconds, labels({ queue: r.queue }))
      }
    })
  }
  if (sources.sponsors) {
    const spendable = m.createObservableGauge(METRIC.sponsorSpendable, { unit: 'XLM', description: 'Sponsor spendable float' })
    const runway = m.createObservableGauge(METRIC.sponsorRunway, { unit: 'd', description: 'Days of fees at the current claim rate' })
    batch([spendable, runway], sources.sponsors, (result, readings) => {
      for (const r of readings) {
        if (r.spendable !== null) result.observe(spendable, r.spendable, labels({ sponsor: r.publicKey, index: r.index }))
        if (r.runwayDays !== null) result.observe(runway, r.runwayDays, labels({ sponsor: r.publicKey, index: r.index }))
      }
    })
  }
  if (sources.stranded) {
    const reserve = m.createObservableGauge(METRIC.strandedReserve, { unit: 'XLM', description: 'XLM locked in stranded ephemeral accounts' })
    const accounts = m.createObservableGauge(METRIC.strandedAccounts, { description: 'Stranded ephemeral accounts' })
    batch([reserve, accounts], sources.stranded, (result, r) => {
      result.observe(reserve, r.reserve, {})
      result.observe(accounts, r.accounts, labels({ state: 'all' }))
      result.observe(accounts, r.critical, labels({ state: 'critical' }))
    })
  }
  if (sources.passes) {
    const remaining = m.createObservableGauge(METRIC.reconcileRemaining, { description: 'Candidates the last pass did not reach' })
    batch([remaining], sources.passes, (result, readings) => {
      for (const r of readings) result.observe(remaining, r.remaining, labels({ job: r.job }))
    })
  }
  if (sources.dependencies) {
    const up = m.createObservableGauge(METRIC.dependencyUp, { description: '1 when the dependency answered within the bound' })
    batch([up], sources.dependencies, (result, readings) => {
      for (const r of readings) result.observe(up, r.up ? 1 : 0, labels({ dependency: r.dependency }))
    })
  }
}
