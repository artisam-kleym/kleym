'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'

/**
 * Deactivation signs the user out immediately, so it is confirmed rather than
 * being a one-click toggle sitting in a table row.
 */
export function ActiveToggle({
  userId,
  username,
  isActive,
  self,
}: {
  userId: string
  username: string
  isActive: boolean
  self: boolean
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function apply() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { detail?: string }
        throw new Error(body.detail ?? 'That did not work.')
      }
      setConfirming(false)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  if (self) {
    return <span className="text-label-sm text-on-surface-variant">That&rsquo;s you</span>
  }

  if (isActive && confirming) {
    return (
      <span className="flex flex-wrap items-center gap-sm">
        <span className="text-label-sm text-on-surface">Sign {username} out and block sign-in?</span>
        <Button type="button" onClick={apply} disabled={busy}>
          {busy ? 'Deactivating…' : 'Deactivate'}
        </Button>
        <Button type="button" variant="tertiary" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        {error && <span className="text-label-sm text-error">{error}</span>}
      </span>
    )
  }

  return (
    <span className="flex items-center gap-sm">
      <Button
        type="button"
        variant={isActive ? 'tertiary' : 'secondary'}
        onClick={() => (isActive ? setConfirming(true) : void apply())}
        disabled={busy}
      >
        {isActive ? 'Deactivate' : busy ? 'Activating…' : 'Activate'}
      </Button>
      {error && <span className="text-label-sm text-error">{error}</span>}
    </span>
  )
}
