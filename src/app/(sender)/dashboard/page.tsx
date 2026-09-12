import Link from 'next/link'
import { getSessionUser } from '@/lib/auth/session'
import { distributedLabel, loadDashboard } from '@/lib/api/dashboard'
import { MetricCard, ProgressCell, StatusChip, Table, TableCell, TableHead, TableRow, type Status } from '@/components/ui'
import { formatDate } from '@/components/list/filters'

export const dynamic = 'force-dynamic'

const CHIP: Record<string, Status> = {
  ACTIVE: 'active', PARTIAL: 'active', EXPIRED: 'expired', RECLAIMED: 'reclaimed', CANCELLED: 'failed',
}

/**
 * `/dashboard` — SPEC.md §5.2: total distributed, active campaigns, pending
 * claims, recent campaigns. The post-login landing page, so the first screen
 * in every demo — and every figure is an aggregate scoped to the signed-in
 * user (lib/api/dashboard.ts), with no link row loaded and no Horizon read.
 *
 * It also keeps SPEC.md §12's multi-tenancy limitation in view: until
 * organisations exist, this is the only place a sender is told that their
 * colleagues cannot see, resend or reclaim a campaign.
 */
export default async function DashboardPage() {
  const user = (await getSessionUser())!
  const { distributed, counts, recent } = await loadDashboard(user.id)

  return (
    <>
      <h1 className="text-display-lg text-primary max-md:text-headline-md">Dashboard</h1>
      <p className="mt-md font-mono text-label-md text-on-surface-variant">
        Signed in as {user.username}
      </p>

      <section aria-label="Totals" className="mt-lg grid grid-cols-1 gap-md md:grid-cols-3">
        {distributed.length === 0 ? (
          <MetricCard label="Distributed" value="0" icon="redeem" tint="green" />
        ) : (
          distributed.map((row) => (
            <MetricCard
              key={`${row.network}:${row.assetCode}:${row.assetIssuer ?? ''}`}
              label={`Distributed · ${distributedLabel(row, distributed)}`}
              value={row.amount}
              unit={row.assetCode}
              icon="redeem"
              tint="green"
              delta={`${row.claimed} ${row.claimed === 1 ? 'claim' : 'claims'}`}
            />
          ))
        )}
        <MetricCard label="Active campaigns" value={String(counts.activeCampaigns)} icon="campaign" tint="yellow" />
        <MetricCard
          label="Pending claims"
          value={String(counts.pendingClaims)}
          unit={counts.pendingClaims === 1 ? 'link' : 'links'}
          icon="pending_actions"
          tint="pink"
          delta={`${counts.outstanding} still claimable`}
        />
      </section>

      <div className="mt-xl flex flex-wrap items-baseline justify-between gap-md">
        <h2 className="text-headline-md text-on-surface">Recent campaigns</h2>
        <Link href="/campaigns" className="font-mono text-label-md text-primary underline-offset-4 hover:underline">
          All campaigns
        </Link>
      </div>
      {recent.length === 0 ? (
        <p className="mt-md rounded-xl border border-dashed border-outline-variant p-lg text-center text-body-md text-on-surface-variant">
          No campaigns yet.{' '}
          <Link href="/campaigns/new" className="text-primary underline-offset-4 hover:underline">
            Create one
          </Link>
          .
        </p>
      ) : (
        <Table className="mt-md">
          <TableHead columns={['Campaign', 'Status', 'Per link', 'Claimed', 'Created']} />
          <tbody>
            {recent.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={`/campaigns/${row.id}`} className="text-primary underline-offset-4 hover:underline">
                    {row.name}
                  </Link>
                </TableCell>
                <TableCell><StatusChip status={CHIP[row.status] ?? 'pending'} /></TableCell>
                <TableCell>{row.amountPerLink} {row.assetCode}</TableCell>
                <TableCell>
                  <ProgressCell claimed={row.claimed} total={row.linkCount} expired={row.status === 'EXPIRED'} />
                </TableCell>
                <TableCell>{formatDate(row.createdAt)}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}

      <div className="mt-xl max-w-2xl rounded-lg border border-outline-variant/50 bg-surface-container p-md">
        <p className="text-body-md font-bold text-on-surface">Campaigns belong to this account alone</p>
        <p className="mt-sm text-body-md text-on-surface-variant">
          There are no shared or organisation accounts. Nobody else can see, resend or
          reclaim a campaign you created — not a colleague, and not Kleym. If someone else
          needs to run a campaign, they need their own account.
        </p>
      </div>
    </>
  )
}
