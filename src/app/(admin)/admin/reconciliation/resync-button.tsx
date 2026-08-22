'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'

/** Queues the same job the cron queues. SPEC.md §5.4. */
export function ResyncButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [queued, setQueued] = useState(false)

  return (
    <div className="flex flex-col items-end gap-xs">
      <Button
        type="button"
        icon="refresh"
        disabled={pending}
        data-testid="resync"
        onClick={() => {
          setPending(true)
          void fetch('/api/admin/reconcile', { method: 'POST' })
            .then((response) => setQueued(response.ok))
            .finally(() => {
              setPending(false)
              // The worker picks it up asynchronously, so the report will not
              // have changed yet — refresh so a later look shows the result.
              router.refresh()
            })
        }}
      >
        {pending ? 'Queueing…' : 'Resync now'}
      </Button>
      {queued && (
        <p role="status" className="font-mono text-label-sm text-on-surface-variant">
          Queued. The worker runs it shortly.
        </p>
      )}
    </div>
  )
}
