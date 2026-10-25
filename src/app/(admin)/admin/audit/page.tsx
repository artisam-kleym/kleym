import { PageHeading } from '@/components/ui/page-heading'
import Link from 'next/link'
import { auditActions, queryAudit } from '@/lib/api/audit'
import { listUsers } from '@/lib/api/admin'
import { listOrganizations } from '@/lib/api/organizations'
import { Table, TableCell, TableHead, TableRow } from '@/components/ui'

export const dynamic = 'force-dynamic'

type Search = Promise<Record<string, string | string[] | undefined>>

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value

/** A date from the filter, or undefined. An unparseable one is ignored, not an error. */
function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined
  const date = new Date(endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * `/admin/audit` — the audit log viewer. SPEC.md §5.4.
 *
 * Filters live in the query string rather than component state so a filtered
 * view is a URL someone can paste into an incident thread. That is most of
 * what this page is for.
 */
export default async function AdminAuditPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const filters = {
    userId: one(params.userId) || undefined,
    organizationId: one(params.organizationId) || undefined,
    action: one(params.action) || undefined,
    entityId: one(params.entityId) || undefined,
    from: parseDate(one(params.from)),
    to: parseDate(one(params.to), true),
    page: Number(one(params.page) ?? '1') || 1,
  }

  const [page, actions, users, organizations] = await Promise.all([
    queryAudit(filters),
    auditActions(),
    listUsers(),
    listOrganizations(),
  ])

  const href = (next: Record<string, string | number | undefined>) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries({ ...params, ...next })) {
      const single = Array.isArray(value) ? value[0] : value
      if (single !== undefined && single !== '') query.set(key, String(single))
    }
    return `/admin/audit?${query.toString()}`
  }

  return (
    <>
      <PageHeading icon="history" tone="yellow">Audit log</PageHeading>
      <p className="mt-md text-body-md text-on-surface-variant">
        {page.total} {page.total === 1 ? 'entry' : 'entries'}. Every mutating action, and
        every seed that reached the server.
      </p>

      <form method="get" className="mt-lg flex flex-wrap items-end gap-md">
        <label className="flex flex-col gap-xs">
          <span className="text-label-md text-on-surface-variant">User</span>
          <select
            name="userId"
            defaultValue={filters.userId ?? ''}
            className="rounded-lg border border-outline-variant bg-surface px-sm py-2 text-body-md text-on-surface"
          >
            <option value="">Anyone</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.username}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-xs">
          <span className="text-label-md text-on-surface-variant">Organisation</span>
          <select
            name="organizationId"
            defaultValue={filters.organizationId ?? ''}
            className="rounded-lg border border-outline-variant bg-surface px-sm py-2 text-body-md text-on-surface"
          >
            <option value="">Any</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-xs">
          <span className="text-label-md text-on-surface-variant">Action</span>
          <select
            name="action"
            defaultValue={filters.action ?? ''}
            className="rounded-lg border border-outline-variant bg-surface px-sm py-2 text-body-md text-on-surface"
          >
            <option value="">Any</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-xs">
          <span className="text-label-md text-on-surface-variant">Entity id</span>
          <input
            name="entityId"
            defaultValue={filters.entityId ?? ''}
            className="rounded-lg border border-outline-variant bg-surface px-sm py-2 font-mono text-label-md text-on-surface"
          />
        </label>

        <label className="flex flex-col gap-xs">
          <span className="text-label-md text-on-surface-variant">From</span>
          <input
            type="date"
            name="from"
            defaultValue={one(params.from) ?? ''}
            className="rounded-lg border border-outline-variant bg-surface px-sm py-2 text-body-md text-on-surface"
          />
        </label>

        <label className="flex flex-col gap-xs">
          <span className="text-label-md text-on-surface-variant">To</span>
          <input
            type="date"
            name="to"
            defaultValue={one(params.to) ?? ''}
            className="rounded-lg border border-outline-variant bg-surface px-sm py-2 text-body-md text-on-surface"
          />
        </label>

        <button
          type="submit"
          className="rounded-lg border border-outline-variant bg-surface-container px-md py-2 text-label-md text-on-surface"
        >
          Filter
        </button>
        <Link href="/admin/audit" className="text-label-md text-on-surface-variant underline underline-offset-4">
          Clear
        </Link>
      </form>

      <Table className="mt-lg">
        <TableHead columns={['When', 'Who', 'Organisation', 'Action', 'Entity', 'IP', 'Detail']} />
        <tbody>
          {page.rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-label-sm">
                {row.createdAt.toISOString().replace('T', ' ').slice(0, 19)}
              </TableCell>
              <TableCell className="font-mono text-label-sm">{row.username ?? '—'}</TableCell>
              <TableCell className="font-mono text-label-sm">{row.organization ?? '—'}</TableCell>
              <TableCell className="font-mono text-label-sm">{row.action}</TableCell>
              <TableCell className="font-mono text-label-sm">
                {row.entityType ? `${row.entityType} ${row.entityId ?? ''}`.trim() : '—'}
              </TableCell>
              <TableCell className="font-mono text-label-sm">{row.ip ?? '—'}</TableCell>
              <TableCell className="font-mono text-label-sm">
                {row.metadata ? JSON.stringify(row.metadata) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>

      {page.rows.length === 0 && (
        <p className="mt-md text-body-md text-on-surface-variant">
          Nothing matches those filters.
        </p>
      )}

      <div className="mt-lg flex items-center gap-md">
        <span className="font-mono text-label-md text-on-surface-variant">
          Page {page.page} of {page.pages}
        </span>
        {page.page > 1 && (
          <Link href={href({ page: page.page - 1 })} className="text-label-md text-on-surface underline underline-offset-4">
            Previous
          </Link>
        )}
        {page.page < page.pages && (
          <Link href={href({ page: page.page + 1 })} className="text-label-md text-on-surface underline underline-offset-4">
            Next
          </Link>
        )}
      </div>
    </>
  )
}
