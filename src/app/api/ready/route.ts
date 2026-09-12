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
import { probeDependencies } from '@/lib/observability/status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  // Postgres, Redis and Horizon, each bounded — the probes /status and the
  // dependency gauge share (#53), so the three never disagree.
  const checks = await probeDependencies()

  const ready = checks.every((check) => check.ok)

  if (!ready) {
    logger.error(
      { checks: Object.fromEntries(checks.map((c) => [c.name, c.detail])) },
      'readiness check failed',
    )
  }

  return Response.json({ ready }, { status: ready ? 200 : 503 })
}
