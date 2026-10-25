/**
 * /status — public, unauthenticated, fed by real signals. Issue #53.
 *
 * The same probes /api/ready runs, the queues, the last bounded passes and
 * the sponsor float, computed live and cached for fifteen seconds — shown
 * as components and STATES only. No counts: queue depths and a low sponsor
 * are operator signals (lib/observability/status.ts says why) and live on
 * /admin.
 */
import { AuthShell } from '@/components/shell/auth-shell'
import { PageHeading } from '@/components/ui/page-heading'
import {
  statusSnapshot,
  STATUS_TTL_MS,
  type ComponentState,
} from '@/lib/observability/status'

export const dynamic = 'force-dynamic'

const STATE: Record<
  ComponentState,
  { label: string; dot: string; text: string }
> = {
  operational: {
    label: 'Operational',
    dot: 'bg-secondary',
    text: 'text-on-surface',
  },
  degraded: { label: 'Degraded', dot: 'bg-tertiary', text: 'text-on-surface' },
  down: { label: 'Down', dot: 'bg-error', text: 'text-error' },
}

function State({ state }: { state: ComponentState }) {
  const s = STATE[state]
  return (
    <span
      className={`inline-flex items-center gap-sm font-mono text-label-md ${s.text}`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${s.dot}`}
        aria-hidden
      />
      {s.label}
    </span>
  )
}

export default async function StatusPage() {
  const status = await statusSnapshot()
  const headline =
    status.overall === 'operational'
      ? 'All systems operational'
      : status.overall === 'degraded'
        ? 'Degraded performance'
        : 'Service disruption'
  return (
    <AuthShell wide>
      <PageHeading
        icon={status.overall === 'operational' ? 'check_circle' : 'warning'}
        tone={status.overall === 'operational' ? 'mint' : 'yellow'}
      >
        {headline}
      </PageHeading>
      <p className="mt-sm text-body-md text-on-surface-variant">
        Live, as of {status.generatedAt.replace('T', ' ').slice(0, 19)} UTC ·
        refreshed every {STATUS_TTL_MS / 1000} seconds.
      </p>

      <ul className="mt-xl divide-y divide-outline-variant rounded-xl border border-outline-variant bg-surface-container-lowest">
        {status.components.map((c) => (
          <li
            key={c.name}
            className="flex flex-wrap items-center justify-between gap-md px-lg py-md"
          >
            <div>
              <p className="text-body-md text-on-surface">{c.name}</p>
              <p className="font-mono text-label-sm text-on-surface-variant">
                {c.note}
              </p>
            </div>
            <State state={c.state} />
          </li>
        ))}
      </ul>

      <p className="mt-xl text-label-md text-on-surface-variant">
        Service levels and error budgets: docs/slo.md in the repository.
        Machine-readable: <span className="font-mono">/api/status</span>.
        Operators: the numbers behind each state are on the admin reconciliation
        page.
      </p>
    </AuthShell>
  )
}
