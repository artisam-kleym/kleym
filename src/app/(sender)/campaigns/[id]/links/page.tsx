import Link from 'next/link'
import { notFound } from 'next/navigation'
import { pageScope } from '@/lib/api/session-guard'
import { StatusChip, StellarAddress, Table, TableCell, TableHead, TableRow, type Status } from '@/components/ui'
import {
  EmptyState, FilterBar, FilterField, FilterSelect, Pagination, firstValues, formatDate,
} from '@/components/list/filters'
import { LINK_STATUSES, linksPage, linksQuerySchema, loadCampaignHeader } from '@/lib/api/campaign-detail'

export const dynamic = 'force-dynamic'

const CHIP: Record<string, Status> = {
  PENDING: 'pending', ACTIVE: 'active', CLAIMED: 'claimed',
  EXPIRED: 'expired', RECLAIMED: 'reclaimed', FAILED: 'failed',
}

/**
 * `/campaigns/[id]/links` — the full link table SPEC.md §5.2 specifies.
 *
 * Paginated and filterable by status, in `LINK_ORDER` — the same order as the
 * preview on the detail page, so the first page here IS the preview there.
 * Ownership is in the campaign query; the links query is scoped to that id.
 */
export default async function CampaignLinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { org } = await pageScope()
  const { id } = await params
  const campaign = await loadCampaignHeader(id, org.id)
  if (!campaign) notFound()

  const raw = firstValues(await searchParams)
  const parsed = linksQuerySchema.safeParse(raw)
  const query = parsed.success ? parsed.data : linksQuerySchema.parse({})
  const { links, total, page, perPage } = await linksPage(campaign.id, query)
  const basePath = `/campaigns/${campaign.id}/links`

  return (
    <>
      <p className="font-mono text-label-md text-on-surface-variant">
        <Link href={`/campaigns/${campaign.id}`} className="text-primary underline-offset-4 hover:underline">
          {campaign.name}
        </Link>
      </p>
      <h1 className="mt-xs text-display-lg text-primary max-md:text-headline-md">Links</h1>
      <p className="mt-md text-body-md text-on-surface-variant">
        {campaign.linkCount} links · {campaign.amountPerLink.toFixed()} {campaign.assetCode} each.
      </p>

      <FilterBar action={basePath}>
        <FilterField label="Status" name="status">
          <FilterSelect
            name="status"
            defaultValue={query.status}
            blank="Any status"
            options={LINK_STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))}
          />
        </FilterField>
      </FilterBar>

      {links.length === 0 ? (
        <EmptyState>{query.status ? 'No links with that status.' : 'No links yet.'}</EmptyState>
      ) : (
        <div className="mt-lg">
          <Table>
            <TableHead columns={['#', 'Label', 'Reference', 'Status', 'Claimant', 'Claimed', 'Transaction']} />
            <tbody>
              {links.map((link, i) => (
                <TableRow key={link.id}>
                  <TableCell className="text-on-surface-variant">{(page - 1) * perPage + i + 1}</TableCell>
                  <TableCell>{link.label ?? '—'}</TableCell>
                  <TableCell className="text-on-surface-variant">
                    {link.reference ?? '—'}
                    {link.category && <span className="ml-sm text-label-sm">{link.category}</span>}
                  </TableCell>
                  <TableCell><StatusChip status={CHIP[link.status] ?? 'pending'} /></TableCell>
                  <TableCell>{link.claimedBy ? <StellarAddress value={link.claimedBy} /> : '—'}</TableCell>
                  <TableCell>{link.claimedAt ? formatDate(link.claimedAt) : '—'}</TableCell>
                  <TableCell>{link.claimTxHash ? <StellarAddress value={link.claimTxHash} /> : '—'}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
          <Pagination
            page={page} perPage={perPage} total={total}
            params={{ status: query.status, perPage: raw.perPage }} basePath={basePath}
          />
        </div>
      )}
    </>
  )
}
