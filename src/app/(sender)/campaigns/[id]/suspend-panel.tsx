'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, WarningPanel } from '@/components/ui'

/**
 * Suspension (#72) — the action that used to be called "cancel".
 *
 * The wording here is the product half of SPEC.md §12: it says what suspending
 * does NOT do. The balances stay on the ledger with the recipient as a valid
 * claimant until expiry, and the claimant model gives the sender no earlier
 * instant. So the panel never says cancelled, revoked or stopped; it says
 * suspended, says the links are still claimable, and says when the reclaim
 * is scheduled.
 */
type Phase = 'idle' | 'confirming' | 'suspending'

interface Suspended {
  suspendedAt: string
  reclaimScheduledFor: string
  outstanding: number
  outstandingAmount: string
}

export function SuspendPanel({
  campaignId,
  assetCode,
  expiresAt,
  expired,
  suspendedAt,
  reclaimDueAt,
  outstanding,
  outstandingAmount,
  suspendedLinks,
  inFlight,
  canAct,
}: {
  campaignId: string
  assetCode: string
  expiresAt: string
  /** Decided on the server, like ReclaimPanel — not from the clock during render. */
  expired: boolean
  suspendedAt: string | null
  reclaimDueAt: string | null
  outstanding: number
  outstandingAmount: string
  /** Links suspended one at a time, still live. */
  suspendedLinks: number
  /** Claims that landed their first step and not their second (SPEC.md §7.3). */
  inFlight: number
  canAct: boolean
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Suspended | null>(null)

  const day = (iso: string) => iso.slice(0, 10)
  const links = (n: number) => (n === 1 ? 'link' : 'links')

  async function suspend() {
    setError(null)
    setPhase('suspending')
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/suspend`, { method: 'POST' })
      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as { detail?: string }
        throw new Error(problem.detail ?? 'The campaign could not be suspended.')
      }
      setDone((await response.json()) as Suspended)
      setPhase('idle')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The campaign could not be suspended.')
      setPhase('idle')
    }
  }

  const since = done?.suspendedAt ?? suspendedAt

  if (since) {
    return (
      <section className="mt-lg rounded-lg border border-outline-variant/50 bg-surface-container p-lg" aria-labelledby="suspended-heading">
        <h2 id="suspended-heading" className="text-headline-md text-on-surface">Suspended</h2>
        <p className="mt-sm max-w-2xl text-body-md text-on-surface-variant">
          Kleym stopped serving this campaign’s links on {day(since)}. That is not a cancellation:{' '}
          <strong className="text-on-surface">
            the funds are still on the Stellar ledger, and anyone holding a link can still claim them directly until{' '}
            {day(expiresAt)}.
          </strong>
        </p>
        <dl className="mt-md grid grid-cols-1 gap-md sm:grid-cols-3">
          <div>
            <dt className="text-label-md text-on-surface-variant">Still outstanding</dt>
            <dd className="mt-1 font-mono text-headline-md text-on-surface">
              {outstanding} {links(outstanding)}
            </dd>
          </div>
          <div>
            <dt className="text-label-md text-on-surface-variant">Worth</dt>
            <dd className="mt-1 font-mono text-headline-md text-on-surface">
              {outstandingAmount} {assetCode}
            </dd>
          </div>
          <div>
            <dt className="text-label-md text-on-surface-variant">Reclaim</dt>
            <dd className="mt-1 font-mono text-headline-md text-on-surface">
              {expired ? 'Due now' : `Scheduled ${day(expiresAt)}`}
            </dd>
          </div>
        </dl>
        {inFlight > 0 && (
          <p className="mt-md max-w-2xl text-body-md text-on-surface-variant">
            {inFlight} {inFlight === 1 ? 'claim was' : 'claims were'} in progress when Kleym stopped — their first step landed
            and Kleym will not build the second. Those balances stay claimable by their holders with their own tooling, and
            the sponsor reserve each one locked stays locked until they finish or the link is reclaimed (SPEC.md §12).
          </p>
        )}
        <p className="mt-md max-w-2xl text-body-md text-on-surface-variant">
          {expired
            ? `The expiry has passed, so whatever is still unclaimed can be returned. ${reclaimDueAt ? 'Your organisation was notified when it came due. ' : ''}Use the reclaim below — it is signed with your wallet.`
            : `Once ${day(expiresAt)} passes, Kleym will mark the reclaim due and notify your organisation’s webhooks. You sign the return with your wallet; Kleym cannot move the funds for you.`}
        </p>
      </section>
    )
  }

  if (expired || outstanding === 0) {
    if (suspendedLinks === 0) return null
  }

  return (
    <section className="mt-lg rounded-lg border border-outline-variant/50 bg-surface-container p-lg" aria-labelledby="suspend-heading">
      <h2 id="suspend-heading" className="text-headline-md text-on-surface">Suspend links</h2>
      <p className="mt-sm max-w-2xl text-body-md text-on-surface-variant">
        Stops Kleym serving every link in this campaign. {outstanding} unclaimed {links(outstanding)} worth{' '}
        {outstandingAmount} {assetCode} are outstanding
        {suspendedLinks > 0 && <>, {suspendedLinks} of them already suspended one at a time</>}.
      </p>

      {error && (
        <p role="alert" className="mt-md text-body-md text-error">
          {error}
        </p>
      )}

      {!canAct ? null : phase === 'confirming' ? (
        <>
          <div className="mt-md">
            <WarningPanel
              heading="This does not stop the payment"
              consequence={`Anyone holding one of these links can still claim it directly on the Stellar network until ${day(expiresAt)}.`}
            >
              The funds stay on the ledger with the recipient as a valid claimant until expiry — the
              link’s terms give you no earlier moment to take them back. Kleym will stop serving the
              links, and the return of whatever is unclaimed is scheduled for {day(expiresAt)}, when
              you will be asked to sign it.
              {inFlight > 0 && (
                <> {inFlight} {inFlight === 1 ? 'claim is' : 'claims are'} mid-way right now; Kleym will not finish them, and the sponsor reserve they hold stays locked until their holders do or the link is reclaimed.</>
              )}
              {' '}A holder who claims after this does so directly on the network, without Kleym’s help.
            </WarningPanel>
          </div>
          <div className="mt-md flex flex-wrap gap-sm">
            <Button onClick={suspend} disabled={phase !== 'confirming'}>Suspend</Button>
            <Button variant="tertiary" onClick={() => setPhase('idle')}>
              Keep serving
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-md">
          <Button variant="secondary" onClick={() => setPhase('confirming')} disabled={phase === 'suspending' || outstanding === 0 || expired}>
            {phase === 'suspending' ? 'Suspending…' : 'Suspend'}
          </Button>
        </div>
      )}
    </section>
  )
}
