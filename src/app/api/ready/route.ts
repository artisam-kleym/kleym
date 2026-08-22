/**
 * Readiness. SPEC.md §6.7 — Postgres, Redis and Horizon reachability.
 *
 * Reports STATUS ONLY. Which dependency is down, and why, goes to the
 * structured log.
 *
 * This endpoint is unauthenticated because Railway's health check calls it, and
 * an unauthenticated endpoint that names your database as unreachable is
 * reconnaissance handed to whoever asks — it tells an attacker the topology and
 * which part of it is currently failing. The exception text is worse than the
 * name: a connection error carries the host and port. Operators get the detail
 * from the log line, which is where they are already looking.
 */
import { logger } from '@/lib/config/logger'
import { env } from '@/lib/config/env'
import { prisma } from '@/lib/db/client'
import { redis } from '@/lib/redis/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Bounded so a hung dependency cannot hold the health check open. */
const TIMEOUT_MS = 3_000

type Probe = { name: string; ok: boolean; detail: string }

function withTimeout<T>(work: Promise<T>, name: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${name} did not answer in ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
    ),
  ])
}

async function probe(name: string, work: () => Promise<unknown>): Promise<Probe> {
  try {
    await withTimeout(Promise.resolve(work()), name)
    return { name, ok: true, detail: 'ok' }
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : 'unreachable' }
  }
}

export async function GET() {
  const checks = await Promise.all([
    // `SELECT 1` rather than a model query: readiness is "can we reach the
    // database", not "does a particular table exist".
    probe('postgres', () => prisma.$queryRaw`SELECT 1`),
    probe('redis', () => redis.ping()),
    probe('horizon', async () => {
      const response = await fetch(env.HORIZON_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
    }),
  ])

  const ready = checks.every((check) => check.ok)

  if (!ready) {
    logger.error(
      { checks: Object.fromEntries(checks.map((c) => [c.name, c.detail])) },
      'readiness check failed',
    )
  }

  return Response.json({ ready }, { status: ready ? 200 : 503 })
}
