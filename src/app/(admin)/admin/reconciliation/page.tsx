import { openFindings, findingsValue } from '@/lib/api/reconcile'
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

export default async function ReconciliationPage() {
  const findings = await openFindings()
  const critical = findings.filter((finding) => finding.severity === 'error')

  return (
    <>
      <div className="flex items-start justify-between gap-md">
        <div>
          <h1 className="text-display-lg text-primary max-md:text-headline-md">Reconciliation</h1>
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
                    <TableCell className="max-w-md whitespace-normal">{finding.detail}</TableCell>
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
