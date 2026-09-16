import Link from 'next/link'
import { pageScope } from '@/lib/api/session-guard'
import { StatusChip, Table, TableCell, TableHead, TableRow, ProgressCell, type Status } from '@/components/ui'
import {
  EmptyState, FilterBar, FilterField, FilterInput, FilterSelect, Pagination, firstValues, formatDate,
} from '@/components/list/filters'
import { CAMPAIGN_STATUSES, campaignListQuerySchema, listCampaigns, parseFilters } from '@/lib/api/campaign-list'

export const dynamic = 'force-dynamic'

/**
 * /campaigns — SPEC.md §5.2: the full list, with search and a status filter.
 *
 * A server component reading through the ownership scope. The signed-in
 * user's id is in the query's `where`, so another user's campaign is not a
 * row here whatever id someone types into the address bar.
 */
export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { org } = await pageScope()
  const raw = firstValues(await searchParams)
  // A malformed field is not an error page; that field falls back, the rest hold.
  const query = parseFilters(campaignListQuerySchema, raw)

  const { rows, total, page, perPage } = await listCampaigns(org.id, query)
  const params = { q: query.q, status: query.status, perPage: raw.perPage }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-display-lg text-primary max-md:text-headline-md">Campaigns</h1>
          <p className="mt-md text-body-md text-on-surface-variant">
            Everything you have created, newest first.
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="inline-flex min-h-11 items-center rounded-lg bg-action px-4 py-3 font-mono text-label-md font-semibold text-action-on shadow-sm hover:bg-action-hover"
        >
          New campaign
        </Link>
      </div>

      <FilterBar action="/campaigns">
        <FilterField label="Search" name="q">
          <FilterInput name="q" defaultValue={query.q} placeholder="Campaign name" />
        </FilterField>
        <FilterField label="Status" name="status">
          <FilterSelect
            name="status"
            defaultValue={query.status}
            blank="Any status"
            options={CAMPAIGN_STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))}
          />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState>
          {total === 0 && !query.q && !query.status
            ? 'No campaigns yet. Create one to see it here.'
            : 'Nothing matches that filter.'}
        </EmptyState>
      ) : (
        <div className="mt-lg">
          <Table>
            <TableHead columns={['Campaign', 'Status', 'Per link', 'Claimed', 'Expires', 'Created']} />
            <tbody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/campaigns/${row.id}`} className="text-primary underline-offset-4 hover:underline">
                      {row.name}
                    </Link>
                    <span className="ml-sm text-label-sm text-on-surface-variant">{row.network}</span>
                  </TableCell>
                  <TableCell><StatusChip status={chipFor(row.status)} /></TableCell>
                  <TableCell>
                    {row.variableAmounts ? 'varies' : row.amountPerLink} {row.assetCode}
                  </TableCell>
                  <TableCell>
                    <ProgressCell claimed={row.claimed} total={row.linkCount} expired={row.status === 'EXPIRED'} />
                  </TableCell>
                  <TableCell>{formatDate(row.expiresAt)}</TableCell>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} perPage={perPage} total={total} params={params} basePath="/campaigns" />
        </div>
      )}
    </>
  )
}

/** Campaign statuses onto the six chip states BRAND.md §10 defines. */
function chipFor(status: string): Status {
  switch (status) {
    case 'ACTIVE':
    case 'PARTIAL':
      return 'active'
    case 'EXPIRED':
      return 'expired'
    case 'RECLAIMED':
      return 'reclaimed'
    case 'CANCELLED':
      return 'failed'
    default:
      return 'pending'
  }
}
