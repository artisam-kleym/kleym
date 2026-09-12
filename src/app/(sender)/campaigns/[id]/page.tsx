import { notFound } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db/client'
import { owned } from '@/lib/api/session-guard'
import { LINK_ORDER } from '@/lib/api/link-order'
import { StatusChip, Table, TableCell, TableHead, TableRow, type Status } from '@/components/ui'
import { ReclaimPanel } from './reclaim-panel'

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
 */
/**
 * Loaded outside the component body.
 *
 * "Has this expired?" is a question about the clock, and reading the clock
 * during render is exactly what React's purity rule forbids — two renders of
 * the same campaign could disagree. It is answered once, here, alongside the
 * data it describes.
 */
async function load(id: string, userId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: owned(id, userId),
    select: {
      id: true, name: true, status: true, assetCode: true, amountPerLink: true,
      linkCount: true, expiresAt: true, senderPublicKey: true, network: true,
      links: {
        orderBy: LINK_ORDER,
        select: { id: true, status: true, label: true, claimTxHash: true },
      },
      reclaims: {
        orderBy: { submittedAt: 'desc' },
        select: { transactionHash: true, amount: true, balanceCount: true, submittedAt: true },
      },
    },
  })
  if (!campaign) return null

  const counted = (status: string) => campaign.links.filter((link) => link.status === status).length

  return {
    campaign,
    counted,
    outstanding: counted('ACTIVE') + counted('EXPIRED'),
    expired: campaign.expiresAt.getTime() <= Date.now(),
  }
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) notFound()
  const { id } = await params

  const loaded = await load(id, user.id)
  if (!loaded) notFound()
  const { campaign, counted, outstanding, expired } = loaded

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
          ['Claimed', counted('CLAIMED')],
          ['Unclaimed', outstanding],
          ['Reclaimed', counted('RECLAIMED')],
          ['Not yet live', counted('PENDING') + counted('FAILED')],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-outline-variant/50 bg-surface-container p-md">
            <dt className="text-label-md text-on-surface-variant">{label}</dt>
            <dd className="mt-1 font-mono text-headline-md text-on-surface">{value}</dd>
          </div>
        ))}
      </dl>

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

      <h2 className="mt-xl text-headline-md text-on-surface">Links</h2>
      <Table className="mt-md">
        <TableHead columns={['Label', 'Status', 'Transaction']} />
        <tbody>
          {campaign.links.map((link) => (
            <TableRow key={link.id}>
              <TableCell>{link.label ?? '—'}</TableCell>
              <TableCell>
                <StatusChip status={CHIP[link.status] ?? 'pending'} />
              </TableCell>
              <TableCell className="font-mono text-label-sm">
                {link.claimTxHash ? `${link.claimTxHash.slice(0, 12)}…` : '—'}
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </>
  )
}
