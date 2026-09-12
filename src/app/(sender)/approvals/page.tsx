import Link from 'next/link'
import { pageScope, roleAtLeast } from '@/lib/api/session-guard'
import { approvalQueue } from '@/lib/api/approvals'
import { Table, TableCell, TableHead, TableRow } from '@/components/ui'
import { formatDate } from '@/components/list/filters'

export const dynamic = 'force-dynamic'

/**
 * `/approvals` — campaigns in this organisation waiting on a second person.
 * Every member can see the queue; deciding happens on the campaign page,
 * where the terms are.
 */
export default async function ApprovalsPage() {
  const { user, org } = await pageScope()
  const queue = await approvalQueue(org.id)
  const approver = roleAtLeast(org.role, 'APPROVER')

  return (
    <>
      <h1 className="text-display-lg text-primary max-md:text-headline-md">Approvals</h1>
      <p className="mt-md max-w-2xl text-body-md text-on-surface-variant">
        {org.approvalThreshold === null
          ? 'Dual control is off for this organisation: campaigns can be signed without a second approval. An owner can turn it on under Settings.'
          : `Campaigns worth ${org.approvalThreshold} or more need ${org.approvalsRequired} ${org.approvalsRequired === 1 ? 'approval' : 'approvals'} from someone other than their creator before a batch can be signed.`}
      </p>

      {queue.length === 0 ? (
        <p className="mt-lg rounded-xl border border-dashed border-outline-variant p-lg text-center text-body-md text-on-surface-variant">
          Nothing is waiting on approval.
        </p>
      ) : (
        <Table className="mt-lg">
          <TableHead columns={['Campaign', 'Created by', 'Value', 'Approvals', 'Created', '']} />
          <tbody>
            {queue.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={`/campaigns/${row.id}`} className="text-primary underline-offset-4 hover:underline">{row.name}</Link>
                </TableCell>
                <TableCell>{row.creator}</TableCell>
                <TableCell>{row.value} {row.assetCode}</TableCell>
                <TableCell>{row.status.granted} of {row.status.needed}{row.status.rejected.length > 0 && ' · rejected'}</TableCell>
                <TableCell>{formatDate(row.createdAt)}</TableCell>
                <TableCell className="text-on-surface-variant">
                  {row.creatorId === user.id ? 'yours' : approver ? <Link href={`/campaigns/${row.id}`} className="text-primary underline-offset-4 hover:underline">Review</Link> : ''}
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </>
  )
}
