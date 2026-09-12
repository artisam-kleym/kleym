'use client'

/**
 * Step-up before an action that moves money (#47).
 *
 * `ensure()` asks the server whether a fresh factor is on the session. If
 * not, the panel is shown and the promise resolves when the user verifies —
 * or false if they dismiss it. A user with no factor enrolled is not asked.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui'
import { FactorPrompt } from './factor-prompt'

interface Status {
  stepUp: 'not-enrolled' | 'fresh' | 'required'
  totp: unknown
  passkeys: unknown[]
}

export function useStepUp(): { ensure: () => Promise<boolean>; panel: ReactNode } {
  const [status, setStatus] = useState<Status | null>(null)
  const [open, setOpen] = useState(false)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const ensure = useCallback(async () => {
    const response = await fetch('/api/auth/mfa/status', { cache: 'no-store' })
    if (!response.ok) return true // no session state to consult; the server will refuse if it must
    const body = (await response.json()) as Status
    if (body.stepUp !== 'required') return true
    setStatus(body)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = (ok: boolean) => {
    setOpen(false)
    resolver.current?.(ok)
    resolver.current = null
  }

  const panel = open && status ? (
    <div role="dialog" aria-label="Verify a second factor" className="mt-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
      <FactorPrompt
        purpose="step-up"
        hasTotp={status.totp !== null}
        hasPasskey={status.passkeys.length > 0}
        title="This moves money. Verify a second factor to continue — it stays fresh for five minutes."
        onVerified={() => settle(true)}
      />
      <Button type="button" variant="tertiary" className="mt-sm" onClick={() => settle(false)}>Cancel</Button>
    </div>
  ) : null

  return { ensure, panel }
}
