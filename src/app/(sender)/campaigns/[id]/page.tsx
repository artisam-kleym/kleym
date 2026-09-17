import Link from 'next/link'
import { notFound } from 'next/navigation'
import { pageScope } from '@/lib/api/session-guard'
import { LINK_PREVIEW, loadCampaignDetail } from '@/lib/api/campaign-detail'
import { StatusChip, StellarAddress, Table, TableCell, TableHead, TableRow, type Status } from '@/components/ui'
import { ReclaimPanel } from './reclaim-panel'
import { RegenerateCsv } from './regenerate-csv'
import { env } from '@/lib/config/env'
import { ApprovalPanel } from './approval-panel'
import { approvalStatus } from '@/lib/api/approvals'
import { roleAtLeast } from '@/lib/api/session-guard'

export const dynamic = 'force-dynamic'

const CHIP: Record<string, Status> = {
  PENDING: 'pending',
  ACTIVE: 'active',
  CLAIMED: 'claimed',
  EXPIRED: 'expired',
  RECLAIMED: 'reclaimed',
  FAILED: 'failed',
}

/**
 * `/campaigns/[id]` — one campaign, and the actions still open on it.
 *
 * The counts here are the DATABASE's view. Reclaim does not trust them: what
 * can actually be returned is decided by a live ledger query when the sender
 * asks (SPEC.md §3.4), so the number shown below and the number reclaimed can
 * legitimately differ if a recipient claimed in between. The panel says so.
 *
 * The link table is a PREVIEW — the first `LINK_PREVIEW` rows — and the counts
 * are a `groupBy`, so a 10,000-link campaign costs this page ten rows and six
 * integers. The full, filterable table is `/campaigns/[id]/links`.
 */
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, org } = await pageScope()
  const { id } = await params

  const [loaded, approval] = await Promise.all([loadCampaignDetail(id, org.id), approvalStatus(id, org.id)])
  if (!loaded || !approval) notFound()
  const { campaign, counts, outstanding, expired } = loaded

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="text-display-lg text-primary max-md:text-headline-md">{campaign.name}</h1>
          <p className="mt-sm font-mono text-label-md text-on-surface-variant">
            {campaign.linkCount} links · {campaign.amountPerLink.toString()} {campaign.assetCode} each ·{' '}
            {expired ? 'expired' : 'expires'} {campaign.expiresAt.toISOString().slice(0, 10)}
          </p>
        </div>
        <StatusChip status={CHIP[campaign.status] ?? 'pending'} />
      </div>

      <dl className="mt-lg grid grid-cols-2 gap-md md:grid-cols-4">
        {[
          ['Claimed', counts.CLAIMED],
          ['Unclaimed', outstanding],
          ['Reclaimed', counts.RECLAIMED],
          ['Not yet live', counts.PENDING + counts.FAILED],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-outline-variant/50 bg-surface-container p-md">
            <dt className="text-label-md text-on-surface-variant">{label}</dt>
            <dd className="mt-1 font-mono text-headline-md text-on-surface">{value}</dd>
          </div>
        ))}
      </dl>

      {campaign.screeningDecision && campaign.screeningDecision !== 'ALLOW' && (
        <div role="status" className="mt-lg rounded-xl border border-error/40 bg-error-container/30 p-md">
          <p className="text-body-md font-bold text-on-surface">
            {campaign.screeningDecision === 'BLOCK' ? 'Screening block' : 'Screening hold'}
          </p>
          <p className="mt-xs text-body-md text-on-surface-variant">
            {campaign.screeningReason ?? (campaign.screeningDecision === 'BLOCK'
              ? 'Your organisation’s screening callback blocked this campaign. It cannot be signed.'
              : 'Your organisation’s screening callback has not allowed this campaign yet. Signing will ask it again.')}
            {campaign.screenedAt && <> · {campaign.screenedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC</>}
          </p>
        </div>
      )}

      <ApprovalPanel
        campaignId={campaign.id}
        status={{
          required: approval.required,
          needed: approval.needed,
          granted: approval.granted,
          satisfied: approval.satisfied,
          reason: approval.reason,
          approvers: approval.approvers.map((a) => ({ ...a, at: a.at.toISOString() })),
        }}
        canDecide={roleAtLeast(org.role, 'APPROVER')}
        isCreator={campaign.userId === user.id}
      />

      {campaign.derivationIndex !== null && roleAtLeast(org.role, 'OPERATOR') && (
        <RegenerateCsv
          campaignId={campaign.id}
          campaignName={campaign.name}
          linkCount={campaign.linkCount}
          derivationIndex={campaign.derivationIndex}
          keyFingerprint={campaign.keyFingerprint}
          appUrl={env.APP_URL}
        />
      )}

      <ReclaimPanel
        campaignId={campaign.id}
        network={campaign.network === 'public' ? 'public' : 'testnet'}
        senderPublicKey={campaign.senderPublicKey}
        assetCode={campaign.assetCode}
        expiresAt={campaign.expiresAt.toISOString()}
        expired={expired}
        outstanding={outstanding}
        alreadyReclaimed={campaign.reclaims.map((reclaim) => ({
          transactionHash: reclaim.transactionHash,
          amount: reclaim.amount.toString(),
          balanceCount: reclaim.balanceCount,
        }))}
      />

      <div className="mt-xl flex flex-wrap items-baseline justify-between gap-md">
        <h2 className="text-headline-md text-on-surface">Links</h2>
        <Link
          href={`/campaigns/${campaign.id}/links`}
          className="font-mono text-label-md text-primary underline-offset-4 hover:underline"
        >
          {campaign.linkCount > LINK_PREVIEW
            ? `Showing the first ${Math.min(LINK_PREVIEW, campaign.links.length)} — see all ${campaign.linkCount}`
            : 'Open the full table'}
        </Link>
      </div>
      <Table className="mt-md">
        <TableHead columns={['Label', 'Status', 'Claimant', 'Transaction']} />
        <tbody>
          {campaign.links.map((link) => (
            <TableRow key={link.id}>
              <TableCell>{link.label ?? '—'}</TableCell>
              <TableCell>
                <StatusChip status={CHIP[link.status] ?? 'pending'} />
              </TableCell>
              <TableCell>{link.claimedBy ? <StellarAddress value={link.claimedBy} /> : '—'}</TableCell>
              <TableCell>{link.claimTxHash ? <StellarAddress value={link.claimTxHash} /> : '—'}</TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </>
  )
}
