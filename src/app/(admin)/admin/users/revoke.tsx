'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'

/**
 * Revoking removes the invited account, so it is confirmed rather than a
 * one-click action sitting in a table row — the same shape as deactivation.
 */
export function RevokeInvitation({ userId, username }: { userId: string; username: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function revoke() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/users/${userId}/invitation`, { method: 'DELETE' })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { detail?: string }
        throw new Error(body.detail ?? 'That did not work.')
      }
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.')
      setBusy(false)
    }
  }

  if (confirming) {
    return (
      <span className="flex flex-wrap items-center gap-sm">
        <span className="text-label-sm text-on-surface">Revoke the link and remove {username}?</span>
        <Button type="button" onClick={revoke} disabled={busy}>{busy ? 'Revoking…' : 'Revoke'}</Button>
        <Button type="button" variant="tertiary" onClick={() => setConfirming(false)}>Keep</Button>
        {error && <span role="alert" className="text-label-sm text-error">{error}</span>}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-sm">
      <span className="text-label-sm text-on-surface-variant">Awaiting invitation</span>
      <Button type="button" variant="tertiary" onClick={() => setConfirming(true)}>Revoke</Button>
    </span>
  )
}
