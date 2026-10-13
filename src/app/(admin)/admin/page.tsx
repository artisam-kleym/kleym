import { PageHeading } from '@/components/ui/page-heading'
import Decimal from 'decimal.js'
import { env } from '@/lib/config/env'
import { sponsorStatuses } from '@/lib/api/sponsor-status'
import { strandedSummary } from '@/lib/api/stranded'
import { Table, TableCell, TableHead, TableRow, StellarAddress, WarningPanel } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * `/admin` — the sponsor float, and what is locked away from it. SPEC.md §5.4, §7.3.
 *
 * Stranded reserve belongs beside the sponsor balance rather than on its own
 * page, because the two numbers are only meaningful together: locked float is
 * float that every future claim cannot use, and 12 XLM stranded means one
 * thing against a 500 XLM sponsor and something else entirely against 20.
 *
 * The fuller admin area is #15. This is the part §7.3 requires.
 */
export default async function AdminPage() {
  const [stranded, sponsors] = await Promise.all([strandedSummary(), sponsorStatuses()])
  // The headline card is the primary — row 0 of the pool — read once, not twice.
  const primary = sponsors[0]
  const float: { spendable: string } | { error: string } =
    primary?.spendable !== null && primary?.spendable !== undefined
      ? { spendable: primary.spendable }
      : { error: 'Horizon did not answer. This is not a balance of zero — it is unknown.' }

  const low =
    'spendable' in float &&
    new Decimal(float.spendable).lessThan(env.SPONSOR_MIN_BALANCE_ALERT)

  return (
    <>
      <PageHeading icon="dashboard" tone="mint">Admin</PageHeading>

      <dl className="mt-lg grid grid-cols-1 gap-md sm:grid-cols-3">
        <div className="rounded-lg border border-outline-variant/50 bg-surface-container p-md">
          <dt className="text-label-md text-on-surface-variant">Sponsor spendable</dt>
          <dd className="mt-1 font-mono text-headline-md text-on-surface">
            {'spendable' in float ? `${float.spendable} XLM` : 'Unknown'}
          </dd>
        </div>
        <div className="rounded-lg border border-outline-variant/50 bg-surface-container p-md">
          <dt className="text-label-md text-on-surface-variant">Locked in stranded accounts</dt>
          <dd className="mt-1 font-mono text-headline-md text-on-surface">{stranded.lockedXlm} XLM</dd>
        </div>
        <div className="rounded-lg border border-outline-variant/50 bg-surface-container p-md">
          <dt className="text-label-md text-on-surface-variant">Stranded accounts</dt>
          <dd className="mt-1 font-mono text-headline-md text-on-surface">
            {stranded.count}
            {stranded.critical > 0 && (
              <span className="ml-sm text-label-md text-error">{stranded.critical} critical</span>
            )}
          </dd>
        </div>
      </dl>

      {'error' in float && (
        <p className="mt-md text-body-md text-on-surface-variant" role="status">
          Sponsor balance: {float.error}
        </p>
      )}

      {low && 'spendable' in float && (
        <div className="mt-md">
          <WarningPanel
            heading="Sponsor balance is below the alert threshold"
            consequence="Claims stop working when the sponsor cannot cover a recipient's reserve."
          >
            {float.spendable} XLM spendable, against a threshold of{' '}
            {env.SPONSOR_MIN_BALANCE_ALERT} XLM.
          </WarningPanel>
        </div>
      )}

      <h2 className="mt-xl text-headline-md text-on-surface">Sponsor pool</h2>
      <p className="mt-sm max-w-3xl text-body-md text-on-surface-variant">
        New campaigns are bound to the first sponsor with at least {env.SPONSOR_WORKING_THRESHOLD} XLM
        spendable, in pool order; a campaign keeps its sponsor for life, because reserves return to the
        account that sponsored them. Runway is &ldquo;at the current claim rate&rdquo; — fees over the
        last seven days&rsquo; claims — and says nothing about a burst. Top-up and rotation:
        <span className="font-mono"> docs/sponsor-runbook.md</span>.
      </p>
      <Table className="mt-md">
        <TableHead columns={['Sponsor', 'Spendable', 'Live campaigns', 'Claims / day (7d)', 'Runway']} />
        <tbody>
          {sponsors.map((s) => (
            <TableRow key={s.publicKey}>
              <TableCell>
                <StellarAddress value={s.publicKey} />
                <span className="ml-sm text-label-sm text-on-surface-variant">{s.index === 0 ? 'primary' : `#${s.index + 1}`}</span>
              </TableCell>
              <TableCell className={s.low ? 'text-error' : undefined}>{s.spendable === null ? 'unknown' : `${s.spendable} XLM`}</TableCell>
              <TableCell>{s.campaigns}</TableCell>
              <TableCell>{s.claimsPerDay}</TableCell>
              <TableCell>{s.runwayDays === null ? (s.claimsPerDay === '0' ? 'no claims in 7 days' : '—') : `${s.runwayDays} days`}</TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>

      <h2 className="mt-xl text-headline-md text-on-surface">Stranded ephemeral accounts</h2>
      <p className="mt-sm max-w-3xl text-body-md text-on-surface-variant">
        A claim where TX1 landed and TX2 never followed leaves an account holding sponsor
        reserve. <strong className="font-semibold text-on-surface">Kleym cannot recover these</strong> —
        the merge needs the ephemeral key, which only the recipient and the sender&rsquo;s CSV
        hold. The reserve returns by itself when the link is finally claimed. No user funds
        are affected.
      </p>

      {stranded.accounts.length === 0 ? (
        <p className="mt-md text-body-md text-on-surface-variant">
          Nothing stranded. Every claim that started has finished.
        </p>
      ) : (
        <Table className="mt-md">
          <TableHead columns={['Account', 'Campaign', 'Locked', 'Since', 'What happened']} />
          <tbody>
            {stranded.accounts.map((account) => (
              <TableRow key={account.linkId}>
                <TableCell>
                  <StellarAddress value={account.ephemeralPublicKey} />
                </TableCell>
                <TableCell>{account.campaignName}</TableCell>
                <TableCell className="font-mono text-label-sm">{account.lockedReserve} XLM</TableCell>
                <TableCell className="font-mono text-label-sm">
                  {account.firstSeenAt.toISOString().slice(0, 10)}
                </TableCell>
                <TableCell>
                  {/*
                    * Labelled, never colour alone — BRAND.md §2.4. "Partial
                    * claim" and "Stranded" are different problems: one needs a
                    * person, the other needs patience.
                    */}
                  <span
                    className={
                      account.critical
                        ? 'inline-flex items-center gap-xs rounded-full border border-error-container bg-error-container px-3 py-1 font-mono text-label-sm text-on-error-container'
                        : 'inline-flex items-center gap-xs rounded-full border border-outline-variant/50 bg-surface-container-high px-3 py-1 font-mono text-label-sm text-on-surface-variant'
                    }
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 rounded-full ${account.critical ? 'bg-error' : 'bg-outline'}`}
                    />
                    {account.critical ? 'Partial claim' : 'Stranded'}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </>
  )
}
