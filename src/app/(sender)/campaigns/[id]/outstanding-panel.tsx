'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'
import type { Outstanding } from '@/lib/api/outstanding'

/**
 * Unclaimed value, managed rather than discovered (#78).
 *
 * The figures come from the LEDGER through /api/campaigns/[id]/outstanding —
 * not from amountPerLink × rows — and the panel says when the reclaim is
 * scheduled, when it came due, and what has been reclaimed. Reminder points
 * are editable here. Expiry extension is presented as what it is on-chain:
 * a reissue, with a new signature and new balance ids, never a settings edit.
 */
const REMINDER_CHOICES = [14, 7, 3, 1]

export function OutstandingPanel({ campaignId, canEdit, renewalExists = false }: { campaignId: string; canEdit: boolean; renewalExists?: boolean }) {
  const router = useRouter()
  const [data, setData] = useState<Outstanding | null | 'error'>(null)
  const [points, setPoints] = useState<number[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/campaigns/${campaignId}/outstanding`)
      .then(async (r) => (r.ok ? ((await r.json()) as Outstanding) : 'error'))
      .then((body) => {
        if (cancelled) return
        setData(body)
        if (body !== 'error') setPoints(body.reminderDaysBefore)
      })
      .catch(() => {
        if (!cancelled) setData('error')
      })
    return () => {
      cancelled = true
    }
  }, [campaignId])

  async function saveReminders() {
    if (!points) return
    setSaving(true)
    setSaveError(null)
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reminderDaysBefore: points }),
      })
      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as { detail?: string }
        throw new Error(problem.detail ?? 'The reminder schedule could not be saved.')
      }
      router.refresh()
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'The reminder schedule could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const day = (iso: string) => iso.slice(0, 10)

  return (
    <section className="mt-lg rounded-lg border border-outline-variant/50 bg-surface-container p-lg" aria-labelledby="outstanding-heading">
      <h2 id="outstanding-heading" className="text-headline-md text-on-surface">Unclaimed value</h2>

      {data === null && <p className="mt-sm text-body-md text-on-surface-variant">Reading the ledger…</p>}
      {data === 'error' && (
        <p role="alert" className="mt-sm text-body-md text-error">The ledger could not be read just now. The counts above are the database’s view.</p>
      )}

      {data && data !== 'error' && (
        <>
          <dl className="mt-md grid grid-cols-1 gap-md sm:grid-cols-3">
            <div>
              <dt className="text-label-md text-on-surface-variant">Still on the ledger</dt>
              <dd className="mt-1 font-mono text-headline-md text-on-surface" data-testid="outstanding-count">
                {data.count} {data.count === 1 ? 'link' : 'links'}
              </dd>
              {data.rowsUnclaimed !== data.count && (
                <p className="mt-1 text-label-sm text-on-surface-variant">
                  The database says {data.rowsUnclaimed}; reconciliation will settle the difference.
                </p>
              )}
            </div>
            <div>
              <dt className="text-label-md text-on-surface-variant">Worth</dt>
              <dd className="mt-1 font-mono text-headline-md text-on-surface" data-testid="outstanding-amount">
                {data.amount} {data.assetCode}
              </dd>
              <p className="mt-1 text-label-sm text-on-surface-variant">Summed from the ledger’s own amounts.</p>
            </div>
            <div>
              <dt className="text-label-md text-on-surface-variant">{data.expired ? 'Expired' : 'Expires'}</dt>
              <dd className="mt-1 font-mono text-headline-md text-on-surface">{day(data.expiresAt)}</dd>
            </div>
          </dl>

          <div className="mt-md rounded-lg border border-outline-variant/50 bg-surface p-md">
            <p className="text-label-md font-semibold text-on-surface">Reclaim</p>
            {data.reclaimed.length > 0 && (
              <ul className="mt-xs space-y-1 font-mono text-label-sm text-on-surface-variant">
                {data.reclaimed.map((r) => (
                  <li key={r.transactionHash}>
                    {day(r.submittedAt)} · {r.balanceCount} {r.balanceCount === 1 ? 'link' : 'links'} · {r.amount} {data.assetCode} returned · {r.transactionHash.slice(0, 12)}…
                  </li>
                ))}
              </ul>
            )}
            {data.count > 0 && (
              <p className="mt-xs text-body-md text-on-surface-variant">
                {data.expired
                  ? `Due${data.reclaimDueAt ? ` since ${day(data.reclaimDueAt)}` : ''}: the remaining ${data.count} can be returned now — use the reclaim panel; you sign it with your wallet.`
                  : `Scheduled for ${day(data.reclaimScheduledFor)}. When that passes, Kleym marks it due and notifies your organisation’s webhooks; you sign the return with your wallet — Kleym cannot move the funds for you.`}
              </p>
            )}
            {data.count === 0 && data.reclaimed.length === 0 && (
              <p className="mt-xs text-body-md text-on-surface-variant">Nothing outstanding on the ledger.</p>
            )}
          </div>

          {!data.expired && !data.suspendedAt && (
            <div className="mt-md rounded-lg border border-outline-variant/50 bg-surface p-md">
              <p className="text-label-md font-semibold text-on-surface">Remind recipients</p>
              <p className="mt-xs text-body-md text-on-surface-variant">
                {data.remindable} of the unclaimed {data.remindable === 1 ? 'link was' : 'links were'} delivered by email and can be
                reminded. A reminder names the sender, amount and expiry and points at the original message — it never
                repeats the link, which Kleym does not keep. Links you distributed yourself cannot be reminded.
              </p>
              {points && (
                <div className="mt-sm flex flex-wrap gap-md">
                  {REMINDER_CHOICES.map((days) => (
                    <label key={days} className="flex items-center gap-xs font-mono text-label-md text-on-surface">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        disabled={!canEdit}
                        checked={points.includes(days)}
                        onChange={(e) => setPoints(e.target.checked ? [...points, days] : points.filter((p) => p !== days))}
                      />
                      {days} {days === 1 ? 'day' : 'days'} before
                    </label>
                  ))}
                </div>
              )}
              {saveError && <p role="alert" className="mt-xs text-label-sm text-error">{saveError}</p>}
              {canEdit && (
                <div className="mt-sm">
                  <Button variant="secondary" onClick={() => void saveReminders()} disabled={saving}>
                    {saving ? 'Saving…' : 'Save reminder schedule'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {data.count > 0 && (
            <div className="mt-md rounded-lg border border-outline-variant/50 bg-surface p-md">
              <p className="text-label-md font-semibold text-on-surface">Renew unused funds after reclaim</p>
              <p className="mt-xs text-body-md text-on-surface-variant">
                Ledger expiry cannot be edited. Wait until {day(data.expiresAt)}, reclaim the unused funds,
                then renew using only that returned budget. To resend a current link, use its saved CSV;
                funding another campaign would create an additional payout.
              </p>
            </div>
          )}
          {data.expired && data.count === 0 && data.reclaimed.length > 0 && canEdit && !renewalExists && (
            <Link href={`/campaigns/new?renew=${campaignId}`} className="mt-md inline-flex min-h-11 items-center rounded-lg border border-outline-variant px-4 py-3 font-mono text-label-md font-semibold text-primary">
              Renew returned funds
            </Link>
          )}
        </>
      )}
    </section>
  )
}
