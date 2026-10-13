import { PageHeading } from '@/components/ui/page-heading'
import Link from 'next/link'
import { pageScope } from '@/lib/api/session-guard'
import { distributedLabel, loadDashboard } from '@/lib/api/dashboard'
import { MetricCard, ProgressCell, StatusChip, Table, TableCell, TableHead, TableRow, type Status } from '@/components/ui'
import { EmptyState, formatDate } from '@/components/list/filters'
import { pendingRuns } from '@/lib/api/templates'

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
 * The note at the bottom says who else can see these campaigns: the members
 * of this organisation, by role — and nobody outside it, Kleym included.
 * (It replaced SPEC.md §12's "one account, nobody else" limitation when
 * organisations arrived in #44.)
 */
export default async function DashboardPage() {
  const { user, org } = await pageScope()
  const [{ distributed, counts, recent }, prepared] = await Promise.all([loadDashboard(org.id), pendingRuns(org.id)])

  return (
    <>
      <div className="dashboard-heading">
        <PageHeading icon="dashboard" tone="mint">Dashboard</PageHeading>
        <Link href="/campaigns/new" className="product-create-link">Create campaign</Link>
      </div>
      <p className="mt-md font-mono text-label-md text-on-surface-variant">
        Signed in as {user.username}
      </p>

      {prepared.length > 0 && (
        // Prepared template runs (#82): drafts a schedule made, waiting for a person to generate keys and sign.
        <section aria-label="Prepared runs" className="mt-lg rounded-xl border border-outline-variant bg-surface-container-lowest p-md" data-testid="prepared-runs">
          <h2 className="text-body-md font-bold text-on-surface">Prepared runs waiting for you</h2>
          <p className="mt-xs text-body-md text-on-surface-variant">
            Each has its terms and recipients; nothing has moved. Generate the keys, save the secrets file and sign.
          </p>
          <ul className="mt-sm flex flex-col gap-xs">
            {prepared.map((run) => (
              <li key={run.id} className="font-mono text-label-md">
                <Link href={`/campaigns/new?draft=${run.campaign.id}`} className="text-primary underline-offset-4 hover:underline">{run.campaign.name}</Link>
                {' '}· {run.campaign.linkCount} links · {run.campaign.amountPerLink.toFixed()} {run.campaign.assetCode} each · {run.kind.toLowerCase()} {formatDate(run.scheduledFor)}
              </li>
            ))}
          </ul>
        </section>
      )}

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
        <EmptyState>
          No campaigns yet.{' '}
          <Link href="/campaigns/new" className="text-primary underline-offset-4 hover:underline">
            Create one
          </Link>
          .
        </EmptyState>
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
                <TableCell>{row.variableAmounts ? 'varies' : row.amountPerLink} {row.assetCode}</TableCell>
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
        <p className="text-body-md font-bold text-on-surface">Campaigns belong to {org.name}</p>
        <p className="mt-sm text-body-md text-on-surface-variant">
          Every member of this organisation can see them; operators and above can create, sign,
          resend and reclaim; viewers can only look. Nobody outside the organisation can see or
          act on them — and neither can Kleym. Members are managed on the Settings page.
        </p>
      </div>
    </>
  )
}
