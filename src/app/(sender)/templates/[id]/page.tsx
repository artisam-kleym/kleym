import { PageHeading } from '@/components/ui/page-heading'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { pageScope, roleAtLeast } from '@/lib/api/session-guard'
import { StatusChip, Table, TableCell, TableHead, TableRow, type Status } from '@/components/ui'
import { formatDate } from '@/components/list/filters'
import { loadTemplate, runHistory } from '@/lib/api/templates'
import { TemplateActions, TemplateEditor } from '../actions'

export const dynamic = 'force-dynamic'

const CHIP: Record<string, Status> = {
  DRAFT: 'pending', CREATING: 'pending', PARTIAL: 'pending', ACTIVE: 'active', EXPIRED: 'expired', CANCELLED: 'expired', RECLAIMED: 'expired', FAILED: 'expired',
}

/** /templates/[id] — one template: its terms, list, schedule, and every campaign it produced (#82). */
export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { org } = await pageScope()
  const { id } = await params
  const template = await loadTemplate(id, org.id)
  if (!template) notFound()
  const runs = await runHistory(template.id, org.id)
  const terms = template.terms as Record<string, unknown>
  const canEdit = roleAtLeast(org.role, 'OPERATOR')

  return (
    <>
      <p className="font-mono text-label-md text-on-surface-variant">
        <Link href="/templates" className="text-primary underline-offset-4 hover:underline">Templates</Link> / {template.name}
      </p>
      <PageHeading icon="pending_actions" tone="pink">{template.name}</PageHeading>
      <p className="mt-md font-mono text-label-md text-on-surface-variant" data-testid="template-terms">
        {String(terms.amountPerLink)} {String(terms.assetCode)} per link · {String(terms.network)} · expires {String(terms.expiryDays)} days after each run · claim policy{' '}
        {String(terms.claimPolicy ?? 'open')} · from {String(terms.senderPublicKey).slice(0, 6)}…{String(terms.senderPublicKey).slice(-4)}
        {!template.enabled && ' · disabled: no scheduled runs until enabled'}
      </p>

      {canEdit && (
        <div className="mt-lg">
          <TemplateActions id={template.id} enabled={template.enabled} />
          <TemplateEditor id={template.id} recipientsCsv={template.recipientsCsv} cadence={template.cadence} runHour={template.runHour} />
        </div>
      )}

      <h2 className="mt-2xl text-headline-md text-on-surface">Runs</h2>
      <p className="mt-xs text-body-md text-on-surface-variant">
        Every campaign produced from this template, newest first. A draft is a run waiting for its keys and signature.
      </p>
      {runs.length === 0 ? (
        <p className="mt-md text-body-md text-on-surface-variant">No runs yet.</p>
      ) : (
        <Table className="mt-md">
          <TableHead columns={['Run', 'Campaign', 'Status', 'Links', 'Total', 'Scheduled for']} />
          <tbody>
            {runs.map((r) =>
              r.campaign ? (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.kind.toLowerCase()}</TableCell>
                  <TableCell>
                    <Link href={r.campaign.status === 'DRAFT' ? `/campaigns/new?draft=${r.campaign.id}` : `/campaigns/${r.campaign.id}`} className="text-primary underline-offset-4 hover:underline">
                      {r.campaign.name}
                    </Link>
                    {r.campaign.status === 'DRAFT' && <span className="ml-sm font-mono text-label-sm text-on-surface-variant">needs keys and signature</span>}
                  </TableCell>
                  <TableCell><StatusChip status={CHIP[r.campaign.status] ?? 'pending'} /></TableCell>
                  <TableCell className="font-mono">{r.campaign.claimed}/{r.campaign.linkCount}</TableCell>
                  <TableCell className="font-mono">{r.campaign.total} {r.campaign.assetCode}</TableCell>
                  <TableCell>{formatDate(r.scheduledFor)}</TableCell>
                </TableRow>
              ) : (
                // A run that prepared nothing: the schedule moved on, and this is why (#82).
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.kind.toLowerCase()}</TableCell>
                  <TableCell className="text-error" data-testid="run-failed">Nothing prepared — {r.failure ?? 'unknown reason'}</TableCell>
                  <TableCell><StatusChip status="expired" /></TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>{formatDate(r.scheduledFor)}</TableCell>
                </TableRow>
              ),
            )}
          </tbody>
        </Table>
      )}
    </>
  )
}
