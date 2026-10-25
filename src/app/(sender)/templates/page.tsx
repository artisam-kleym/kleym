import { PageHeading } from '@/components/ui/page-heading'
import Link from 'next/link'
import { pageScope } from '@/lib/api/session-guard'
import { roleAtLeast } from '@/lib/api/session-guard'
import { Table, TableCell, TableHead, TableRow } from '@/components/ui'
import { formatDate } from '@/components/list/filters'
import { listTemplates } from '@/lib/api/templates'
import { TemplateActions } from './actions'

export const dynamic = 'force-dynamic'

/**
 * /templates — campaign templates and their schedules (#82). A schedule
 * PREPARES a run — a draft with the terms and recipients — and a person
 * still generates keys, saves the file and signs. Said on the page.
 */
export default async function TemplatesPage() {
  const { org } = await pageScope()
  const templates = await listTemplates(org.id)
  const canEdit = roleAtLeast(org.role, 'OPERATOR')

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <PageHeading icon="pending_actions" tone="pink">Templates</PageHeading>
          <p className="mt-md max-w-2xl text-body-md text-on-surface-variant">
            A template is a campaign’s terms and recipient list, saved to run again. A schedule prepares a run —
            the campaign is created in draft with everything but the keys — and tells you it is ready. You still
            generate the keys, save the secrets file and sign: nothing here can move money on its own.
          </p>
        </div>
      </div>

      {templates.length === 0 ? (
        <p className="mt-lg text-body-md text-on-surface-variant" data-testid="templates-empty">
          No templates yet. Open a campaign and choose “Save as template”.
        </p>
      ) : (
        <Table className="mt-lg">
          <TableHead columns={['Template', 'Asset', 'Schedule', 'Next run', 'Last run', '']} />
          <tbody>
            {templates.map((t) => {
              const terms = t.terms as { assetCode?: string; amountPerLink?: string }
              return (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link href={`/templates/${t.id}`} className="text-primary underline-offset-4 hover:underline">{t.name}</Link>
                    {!t.enabled && <span className="ml-sm font-mono text-label-sm text-on-surface-variant">disabled</span>}
                  </TableCell>
                  <TableCell className="font-mono">{terms.amountPerLink} {terms.assetCode}</TableCell>
                  <TableCell className="font-mono">{t.cadence ? `${t.cadence} at ${String(t.runHour).padStart(2, '0')}:00 UTC` : 'by hand'}</TableCell>
                  <TableCell>{t.enabled && t.nextRunAt ? formatDate(t.nextRunAt) : '—'}</TableCell>
                  <TableCell>{t.lastRunAt ? formatDate(t.lastRunAt) : '—'}</TableCell>
                  <TableCell>{canEdit && <TemplateActions id={t.id} enabled={t.enabled} compact />}</TableCell>
                </TableRow>
              )
            })}
          </tbody>
        </Table>
      )}
    </>
  )
}
