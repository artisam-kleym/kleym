'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'

/**
 * Per-link suspension (#72), for the wrong-recipient case.
 *
 * Two clicks, and the second one is preceded by the same statement the
 * campaign-wide panel makes: this does not stop the payment. The balance is
 * still claimable by whoever holds the link until the campaign expires.
 */
export function SuspendLinkButton({ campaignId, linkId, expiresAt }: { campaignId: string; linkId: string; expiresAt: string }) {
  const router = useRouter()
  const [phase, setPhase] = useState<'idle' | 'confirming' | 'suspending'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function suspend() {
    setError(null)
    setPhase('suspending')
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/links/${linkId}/suspend`, { method: 'POST' })
      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as { detail?: string }
        throw new Error(problem.detail ?? 'The link could not be suspended.')
      }
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The link could not be suspended.')
      setPhase('idle')
    }
  }

  if (phase === 'idle') {
    return (
      <Button variant="tertiary" onClick={() => setPhase('confirming')}>
        Suspend
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-xs">
      <p className="max-w-xs text-label-sm text-on-surface-variant">
        Kleym stops serving this link. Its holder can still claim on the ledger until {expiresAt.slice(0, 10)}; the
        balance returns to you in the reclaim after that.
      </p>
      {error && (
        <p role="alert" className="text-label-sm text-error">
          {error}
        </p>
      )}
      <div className="flex gap-xs">
        <Button variant="secondary" onClick={suspend} disabled={phase === 'suspending'}>
          {phase === 'suspending' ? 'Suspending…' : 'Suspend link'}
        </Button>
        <Button variant="tertiary" onClick={() => setPhase('idle')} disabled={phase === 'suspending'}>
          Keep
        </Button>
      </div>
    </div>
  )
}
