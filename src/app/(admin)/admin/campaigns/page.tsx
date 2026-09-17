import { listAllCampaigns } from '@/lib/api/admin'
import { StatusChip, Table, TableCell, TableHead, TableRow, type Status } from '@/components/ui'

export const dynamic = 'force-dynamic'

const CHIP: Record<string, Status> = {
  DRAFT: 'pending',
  CREATING: 'pending',
  ACTIVE: 'active',
  PARTIAL: 'failed',
  EXPIRED: 'expired',
  RECLAIMED: 'reclaimed',
  CANCELLED: 'expired',
}

/** `/admin/campaigns` — every campaign, whoever owns it. SPEC.md §5.4. */
export default async function AdminCampaignsPage() {
  const campaigns = await listAllCampaigns()

  return (
    <>
      <h1 className="text-display-lg text-primary max-md:text-headline-md">Campaigns</h1>
      <p className="mt-md text-body-md text-on-surface-variant">
        The {campaigns.length} most recent, across every account.
      </p>

      <Table className="mt-lg">
        <TableHead columns={['Campaign', 'Owner', 'Status', 'Claimed', 'Expires']} />
        <tbody>
          {campaigns.map((campaign) => (
            <TableRow key={campaign.id}>
              <TableCell>
                {campaign.name}
                <span className="ml-sm font-mono text-label-sm text-on-surface-variant">
                  {campaign.variableAmounts ? 'varies' : campaign.amountPerLink} {campaign.assetCode}
                </span>
              </TableCell>
              <TableCell className="font-mono text-label-sm">{campaign.owner}</TableCell>
              <TableCell>
                <StatusChip status={CHIP[campaign.status] ?? 'pending'} />
              </TableCell>
              <TableCell className="font-mono text-label-sm">
                {campaign.claimed} / {campaign.linkCount}
              </TableCell>
              <TableCell className="font-mono text-label-sm">
                {campaign.expiresAt.toISOString().slice(0, 10)}
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </>
  )
}
