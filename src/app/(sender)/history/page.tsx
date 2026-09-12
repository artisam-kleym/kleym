import Link from 'next/link'
import { getSessionUser } from '@/lib/auth/session'
import { StatusChip, StellarAddress, Table, TableCell, TableHead, TableRow } from '@/components/ui'
import {
  EmptyState, FilterBar, FilterField, FilterInput, FilterSelect, Pagination, firstValues, formatDate,
} from '@/components/list/filters'
import { campaignNames, claimHistory, explorerTxUrl, historyQuerySchema, parseFilters } from '@/lib/api/campaign-list'

export const dynamic = 'force-dynamic'

/**
 * /history — SPEC.md §5.2: claim activity across campaigns, newest first.
 *
 * Not a table of its own. A claim or a reclaim is recorded on the link
 * (`claimedAt`, `claimedBy`, `claimTxHash`), and this reads those through the
 * campaign's owner in one clause.
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = (await getSessionUser())!
  const raw = firstValues(await searchParams)
  // A malformed field is not an error page; that field falls back, the rest hold.
  const query = parseFilters(historyQuerySchema, raw)

  const [{ rows, total, page, perPage }, campaigns] = await Promise.all([
    claimHistory(user.id, query),
    campaignNames(user.id),
  ])
  const params = { campaignId: query.campaignId, from: raw.from, to: raw.to, perPage: raw.perPage }

  return (
    <>
      <h1 className="text-display-lg text-primary max-md:text-headline-md">History</h1>
      <p className="mt-md text-body-md text-on-surface-variant">
        Every claim and reclaim across your campaigns, newest first.
      </p>

      <FilterBar action="/history">
        <FilterField label="Campaign" name="campaignId">
          <FilterSelect
            name="campaignId"
            defaultValue={query.campaignId}
            blank="All campaigns"
            options={campaigns.map((c) => ({ value: c.id, label: c.name }))}
          />
        </FilterField>
        <FilterField label="From" name="from">
          <FilterInput name="from" type="date" defaultValue={raw.from} />
        </FilterField>
        <FilterField label="To" name="to">
          <FilterInput name="to" type="date" defaultValue={raw.to} />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState>
          {total === 0 && !query.campaignId && !query.from && !query.to
            ? 'Nothing has been claimed yet.'
            : 'Nothing matches that filter.'}
        </EmptyState>
      ) : (
        <div className="mt-lg">
          <Table>
            <TableHead columns={['When', 'Campaign', 'Amount', 'Outcome', 'Claimant', 'Transaction']} />
            <tbody>
              {rows.map((row) => (
                <TableRow key={row.linkId}>
                  <TableCell>{row.claimedAt ? formatDate(row.claimedAt) : '—'}</TableCell>
                  <TableCell>
                    <Link href={`/campaigns/${row.campaignId}`} className="text-primary underline-offset-4 hover:underline">
                      {row.campaignName}
                    </Link>
                  </TableCell>
                  <TableCell>{row.amount} {row.assetCode}</TableCell>
                  <TableCell><StatusChip status={row.status === 'CLAIMED' ? 'claimed' : 'reclaimed'} /></TableCell>
                  <TableCell>{row.claimedBy ? <StellarAddress value={row.claimedBy} /> : '—'}</TableCell>
                  <TableCell>
                    {row.claimTxHash ? (
                      <a
                        href={explorerTxUrl(row.network, row.claimTxHash)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        <StellarAddress value={row.claimTxHash} className="text-primary" />
                      </a>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} perPage={perPage} total={total} params={params} basePath="/history" />
        </div>
      )}
    </>
  )
}
