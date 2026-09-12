'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'

export interface ApprovalView {
  required: boolean
  needed: number
  granted: number
  satisfied: boolean
  reason: string | null
  approvers: { username: string; decision: string; note: string | null; at: string; current: boolean }[]
}

/**
 * Where the campaign stands with its approvers, and — for an Approver who
 * did not create it — the two buttons. The server refuses the creator and
 * anyone below Approver regardless; the buttons are hidden only so the
 * panel reads as a status for everyone else.
 */
export function ApprovalPanel({
  campaignId,
  status,
  canDecide,
  isCreator,
}: {
  campaignId: string
  status: ApprovalView
  canDecide: boolean
  isCreator: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')

  if (!status.required) return null

  async function send(decision: 'APPROVED' | 'REJECTED') {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/approvals`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, ...(note.trim() ? { note: note.trim() } : {}) }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { detail?: string }
        throw new Error(body.detail ?? 'That did not work.')
      }
      setNote('')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-label="Approval"
      className={`mt-lg rounded-lg border p-md ${status.satisfied ? 'border-action/40 bg-action/10' : 'border-accent-yellow/50 bg-accent-yellow/10'}`}
      data-testid="approval-panel"
    >
      <p className="text-body-md font-bold text-on-surface">
        {status.satisfied
          ? `Approved — ${status.granted} of ${status.needed} required`
          : `Awaiting approval — ${status.granted} of ${status.needed}`}
      </p>
      {status.reason && <p className="mt-xs text-body-md text-on-surface-variant">{status.reason}</p>}
      {status.approvers.length > 0 && (
        <ul className="mt-sm space-y-1 font-mono text-label-sm text-on-surface-variant">
          {status.approvers.map((a) => (
            <li key={a.username}>
              {a.username} · {a.decision.toLowerCase()} · {new Date(a.at).toUTCString()}
              {!a.current && ' · for earlier terms'}
              {a.note && ` — “${a.note}”`}
            </li>
          ))}
        </ul>
      )}
      {isCreator && (
        <p className="mt-sm text-label-sm text-on-surface-variant">You created this campaign, so your approval does not count.</p>
      )}
      {canDecide && !isCreator && (
        <div className="mt-md flex flex-wrap items-end gap-sm">
          <label className="flex min-w-[14rem] flex-1 flex-col gap-xs font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              className="min-h-11 rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md normal-case tracking-normal text-on-surface"
            />
          </label>
          <Button type="button" disabled={busy} onClick={() => void send('APPROVED')}>Approve</Button>
          <Button type="button" variant="tertiary" disabled={busy} onClick={() => void send('REJECTED')}>Reject</Button>
        </div>
      )}
      {error && <p role="alert" className="mt-sm font-mono text-label-sm text-error">{error}</p>}
    </section>
  )
}
