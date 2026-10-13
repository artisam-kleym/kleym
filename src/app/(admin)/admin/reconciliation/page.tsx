import { PageHeading } from '@/components/ui/page-heading'
import { openFindings, findingsValue } from '@/lib/api/reconcile'
import { lastPassReports, type PassJob, type PassReport } from '@/lib/queue/pass-report'
import { operatorStatus } from '@/lib/observability/status'
import { Table, TableCell, TableHead, TableRow, StellarAddress } from '@/components/ui'
import { ResyncButton } from './resync-button'

export const dynamic = 'force-dynamic'

/**
 * `/admin/reconciliation` — the database-versus-chain drift report. SPEC.md §5.4, §7.2.
 *
 * The critical class is deliberately NOT auto-corrected, so this page is the
 * only place it surfaces. A log line scrolls away; a row someone has to close
 * does not.
 */
/**
 * A labelled badge rather than `StatusChip`, whose labels are fixed to link
 * statuses. BRAND.md §2.4 still applies: the word carries the meaning and the
 * dot is decoration, so this survives greyscale and colour blindness.
 */
function Severity({ severity }: { severity: string }) {
  const critical = severity === 'error'
  return (
    <span
      className={
        critical
          ? 'inline-flex items-center gap-xs rounded-full border border-error-container bg-error-container px-3 py-1 font-mono text-label-sm text-on-error-container'
          : 'inline-flex items-center gap-xs rounded-full border border-outline-variant/50 bg-surface-container-high px-3 py-1 font-mono text-label-sm text-on-surface-variant'
      }
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${critical ? 'bg-error' : 'bg-outline'}`} />
      {critical ? 'Critical' : 'Drift'}
    </span>
  )
}

/**
 * The last scheduled pass of each bounded job. A pass that stopped short
 * says how many links it left; a job that has not run for two intervals
 * says so instead of showing a comforting old number.
 */
function PassRow({ job, label, report, now }: { job: PassJob; label: string; report?: PassReport; now: number }) {
  if (!report) {
    return (
      <TableRow>
        <TableCell>{label}</TableCell>
        <TableCell className="text-on-surface-variant" >—</TableCell>
        <TableCell className="text-on-surface-variant">—</TableCell>
        <TableCell className="text-on-surface-variant">No pass recorded yet</TableCell>
      </TableRow>
    )
  }
  const age = now - new Date(report.finishedAt).getTime()
  const stale = age > 2 * report.intervalMs
  const behind = report.remaining > 0
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell>{report.checked} of {report.limit}</TableCell>
      <TableCell className={behind ? 'text-error' : undefined} data-testid={`${job}-remaining`}>{report.remaining}</TableCell>
      <TableCell className={stale ? 'text-error' : 'text-on-surface-variant'}>
        {Math.round(age / 60_000)} min ago{stale ? ' — expected every ' + report.intervalMs / 60_000 + ' min' : ''}
      </TableCell>
    </TableRow>
  )
}

/** Loaded outside render: "how old is this?" is a clock question, answered once with the data. */
async function loadPasses() {
  return { passes: await lastPassReports(), now: Date.now() }
}

/** The queue numbers the public /status deliberately does not show (#53). */
async function loadQueues() {
  try {
    return (await operatorStatus()).queues
  } catch {
    return null
  }
}

export default async function ReconciliationPage() {
  const [findings, { passes, now }, queues] = await Promise.all([openFindings(), loadPasses(), loadQueues()])
  const critical = findings.filter((finding) => finding.severity === 'error')
  const behind = Object.values(passes).filter((p) => p && p.remaining > 0)

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <PageHeading icon="refresh" tone="mint">Reconciliation</PageHeading>
          <p className="mt-md max-w-2xl text-body-md text-on-surface-variant">
            What the database says, against what the ledger says. Every disagreement is
            resolved in the ledger&rsquo;s favour — except one, which is never corrected
            automatically because it means we recorded money as moved when it had not.
          </p>
        </div>
        <ResyncButton />
      </div>

      {critical.length > 0 && (
        <div role="alert" className="mt-xl rounded-lg border border-error bg-error-container/30 p-md">
          <p className="text-body-md font-bold text-on-surface">
            {critical.length} link{critical.length === 1 ? '' : 's'} recorded as settled while
            still on the ledger
          </p>
          <p className="mt-1 text-body-md text-on-surface-variant">
            These are not corrected automatically. Investigate before changing any row —
            the record is the evidence of whatever produced it.
          </p>
        </div>
      )}

      <section aria-label="After a restore" className="mt-xl rounded-lg border border-outline-variant/50 bg-surface-container p-md">
        <p className="text-body-md font-bold text-on-surface">After a database restore, reconcile first</p>
        <p className="mt-xs max-w-3xl text-body-md text-on-surface-variant">
          The ledger is the authority on money: every link converges to what the chain says.
          What a restore cannot get back is what the chain never held — emailed-link state, the
          CSV export gate, audit rows, sessions and API keys made after the backup. Run{' '}
          <span className="font-mono">pnpm recover</span> before anything else; the procedure and
          the measured recovery time are in <span className="font-mono">docs/disaster-recovery.md</span>.
        </p>
      </section>

      <section aria-label="Scheduled passes" className="mt-xl">
        <h2 className="text-headline-sm text-on-surface">Scheduled passes</h2>
        <p className="mt-xs max-w-2xl text-body-md text-on-surface-variant">
          Each pass reads a bounded number of links and continues from where the last one
          stopped. A non-zero remainder means the set is larger than one pass — coverage
          takes several — and a pass that has not run for two intervals is flagged.
        </p>
        {behind.length > 0 && (
          <p role="status" className="mt-sm font-mono text-label-sm text-error">
            {behind.map((p) => `${p!.job}: ${p!.remaining} links not yet reached`).join(' · ')}
          </p>
        )}
        <Table className="mt-md">
          <TableHead columns={['Job', 'Read last pass', 'Remaining', 'Last run']} />
          <tbody>
            <PassRow job="reconcile" label="Reconcile (every 5 min)" report={passes.reconcile} now={now} />
            <PassRow job="ephemeral-watch" label="Ephemeral watch (every 15 min)" report={passes['ephemeral-watch']} now={now} />
            <PassRow job="delivery-retention" label="Delivery retention (daily)" report={passes['delivery-retention']} now={now} />
            <PassRow job="reminders" label="Claim reminders (hourly)" report={passes.reminders} now={now} />
          </tbody>
        </Table>
      </section>

      <section aria-label="Background queues" className="mt-xl">
        <h2 className="text-headline-sm text-on-surface">Background queues</h2>
        <p className="mt-xs max-w-2xl text-body-md text-on-surface-variant">
          Live from the queue store. A job waiting more than two minutes means no worker is
          draining that queue; the public status page shows this only as &ldquo;degraded&rdquo;.
        </p>
        {queues === null ? (
          <p role="status" className="mt-sm font-mono text-label-sm text-error">Queues unreadable — the queue store is not answering.</p>
        ) : (
          <Table className="mt-md">
            <TableHead columns={['Queue', 'Waiting', 'Active', 'Failed', 'Oldest waiting']} />
            <tbody>
              {queues.map((q) => (
                <TableRow key={q.queue}>
                  <TableCell className="font-mono">{q.queue}</TableCell>
                  <TableCell>{q.waiting}</TableCell>
                  <TableCell>{q.active}</TableCell>
                  <TableCell className={q.failed > 0 ? 'text-error' : ''}>{q.failed}</TableCell>
                  <TableCell className={q.oldestWaitingSeconds > 120 ? 'text-error' : 'text-on-surface-variant'}>
                    {q.oldestWaitingSeconds > 0 ? `${q.oldestWaitingSeconds}s` : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <div className="mt-xl">
        {findings.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">
            No open drift. The database and the ledger agree.
          </p>
        ) : (
          <>
            <p className="mb-md font-mono text-label-md text-on-surface-variant">
              {findings.length} open · {findingsValue(findings)} of value involved
            </p>
            <Table>
              <TableHead columns={['Severity', 'Campaign', 'Link', 'What happened', 'First seen']} />
              <tbody>
                {findings.map((finding) => (
                  <TableRow key={finding.id}>
                    <TableCell>
                      <Severity severity={finding.severity} />
                    </TableCell>
                    <TableCell>{finding.campaign.name}</TableCell>
                    <TableCell>
                      <StellarAddress value={finding.link.ephemeralPublicKey} />
                    </TableCell>
                    <TableCell className="max-w-[28rem] whitespace-normal">{finding.detail}</TableCell>
                    <TableCell>{finding.firstSeenAt.toISOString().slice(0, 16).replace('T', ' ')}</TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </div>
    </>
  )
}
