/**
 * /status — public, unauthenticated, fed by real signals. Issue #53.
 *
 * The same probes /api/ready runs, the queues as BullMQ holds them, the
 * last bounded passes and the sponsor float, computed live and cached for
 * fifteen seconds. Names components, not hosts; states, not error text.
 */
import { AmbientOrbs, Icon } from '@/components/ui'
import { statusSnapshot, STATUS_TTL_MS, type ComponentState } from '@/lib/observability/status'

export const dynamic = 'force-dynamic'

const STATE: Record<ComponentState, { label: string; dot: string; text: string }> = {
  operational: { label: 'Operational', dot: 'bg-secondary', text: 'text-on-surface' },
  degraded: { label: 'Degraded', dot: 'bg-tertiary', text: 'text-on-surface' },
  down: { label: 'Down', dot: 'bg-error', text: 'text-error' },
}

function State({ state }: { state: ComponentState }) {
  const s = STATE[state]
  return (
    <span className={`inline-flex items-center gap-sm font-mono text-label-md ${s.text}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  )
}

export default async function StatusPage() {
  const status = await statusSnapshot()
  const headline = status.overall === 'operational' ? 'All systems operational' : status.overall === 'degraded' ? 'Degraded performance' : 'Service disruption'
  return (
    <>
      <AmbientOrbs variant="claim" />
      <main className="mx-auto flex min-h-screen max-w-[720px] flex-col justify-center px-margin-mobile py-2xl">
        <div className="mb-xl flex items-center gap-sm text-primary">
          <Icon name="toll" size={32} filled />
          <span className="text-headline-md">Kleym</span>
        </div>
        <h1 className="text-headline-lg text-primary">{headline}</h1>
        <p className="mt-sm text-body-md text-on-surface-variant">
          Live, as of {status.generatedAt.replace('T', ' ').slice(0, 19)} UTC · refreshed every {STATUS_TTL_MS / 1000} seconds.
        </p>

        <ul className="mt-xl divide-y divide-outline-variant rounded-xl border border-outline-variant bg-surface-container-lowest">
          {status.components.map((c) => (
            <li key={c.name} className="flex flex-wrap items-center justify-between gap-md px-lg py-md">
              <div>
                <p className="text-body-md text-on-surface">{c.name}</p>
                <p className="font-mono text-label-sm text-on-surface-variant">{c.note}</p>
              </div>
              <State state={c.state} />
            </li>
          ))}
        </ul>

        {status.passes.length > 0 && (
          <>
            <h2 className="mt-xl text-headline-sm text-on-surface">Scheduled reconciliation</h2>
            <ul className="mt-md divide-y divide-outline-variant rounded-xl border border-outline-variant bg-surface-container-lowest">
              {status.passes.map((p) => (
                <li key={p.job} className="flex flex-wrap items-center justify-between gap-md px-lg py-md">
                  <div>
                    <p className="font-mono text-body-md text-on-surface">{p.job}</p>
                    <p className="font-mono text-label-sm text-on-surface-variant">
                      {p.finishedAt ? `last pass ${p.finishedAt.replace('T', ' ').slice(0, 16)} UTC` : 'no pass recorded'}
                      {p.remaining > 0 && ` · ${p.remaining} left for the next pass`}
                    </p>
                  </div>
                  <State state={p.state} />
                </li>
              ))}
            </ul>
          </>
        )}

        {status.queues.length > 0 && (
          <>
            <h2 className="mt-xl text-headline-sm text-on-surface">Background queues</h2>
            <ul className="mt-md divide-y divide-outline-variant rounded-xl border border-outline-variant bg-surface-container-lowest">
              {status.queues.map((q) => (
                <li key={q.queue} className="flex flex-wrap items-center justify-between gap-md px-lg py-sm font-mono text-label-md">
                  <span className="text-on-surface">{q.queue}</span>
                  <span className="text-on-surface-variant">
                    {q.waiting} waiting · {q.active} active · {q.failed} failed
                    {q.oldestWaitingSeconds > 0 && ` · oldest ${q.oldestWaitingSeconds}s`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-xl text-label-md text-on-surface-variant">
          Service levels and error budgets: docs/slo.md in the repository. Machine-readable: <span className="font-mono">/api/status</span>.
        </p>
      </main>
    </>
  )
}
