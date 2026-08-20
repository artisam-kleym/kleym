/**
 * Readiness. SPEC.md §6.7: Postgres + Redis + Horizon reachability.
 *
 * Wired to real checks as those clients land (#3 for Postgres, later issues for
 * Redis and Horizon). Until then it reports each dependency as unconfigured
 * rather than falsely reporting ready.
 */
import { env } from '@/lib/config/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Check = { name: string; ok: boolean; detail: string }

async function checkHorizon(): Promise<Check> {
  try {
    const res = await fetch(env.HORIZON_URL, { signal: AbortSignal.timeout(5000) })
    return { name: 'horizon', ok: res.ok, detail: `HTTP ${res.status}` }
  } catch (e) {
    return { name: 'horizon', ok: false, detail: e instanceof Error ? e.message : 'unreachable' }
  }
}

export async function GET() {
  const checks: Check[] = [
    // Postgres and Redis clients arrive with #3 and the queue work.
    { name: 'postgres', ok: false, detail: 'not wired yet (#3)' },
    { name: 'redis', ok: false, detail: 'not wired yet' },
    await checkHorizon(),
  ]

  const ready = checks.every((c) => c.ok)
  return Response.json({ ready, checks }, { status: ready ? 200 : 503 })
}
