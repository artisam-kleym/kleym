'use client'

/**
 * Presenting a second factor (#47): a six-digit code, a recovery code, or a
 * passkey. Used at sign-in (`purpose: 'login'`) and for step-up before the
 * actions that move money (`purpose: 'step-up'`). Nothing here is stored;
 * the server decides.
 */
import { useState, type FormEvent } from 'react'
import { Button, Input } from '@/components/ui'

export type Purpose = 'login' | 'step-up'

async function passkey(purpose: Purpose): Promise<{ ok: boolean; message?: string }> {
  const { startAuthentication } = await import('@simplewebauthn/browser')
  const optionsResponse = await fetch('/api/auth/mfa/passkey/authenticate/options', { method: 'POST' })
  if (!optionsResponse.ok) return { ok: false, message: 'Could not start the passkey prompt.' }
  const optionsJSON = await optionsResponse.json()
  let assertion
  try {
    assertion = await startAuthentication({ optionsJSON })
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'The passkey prompt was cancelled.' }
  }
  const verify = await fetch('/api/auth/mfa/passkey/authenticate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ response: assertion, purpose }),
  })
  return verify.ok ? { ok: true } : { ok: false, message: 'That passkey was not accepted.' }
}

export function FactorPrompt({ purpose, hasPasskey, hasTotp, onVerified, title }: { purpose: Purpose; hasPasskey: boolean; hasTotp: boolean; onVerified: () => void; title?: string }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const code = String(new FormData(event.currentTarget).get('code') ?? '').trim()
    const response = await fetch('/api/auth/mfa/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, purpose }) })
    const body = (await response.json().catch(() => ({}))) as { reason?: string; attemptsLeft?: number }
    setBusy(false)
    if (response.ok) return onVerified()
    if (response.status === 423 || body.reason === 'locked') setError('Too many wrong codes. This factor is locked for fifteen minutes.')
    else if (response.status === 429) setError('Too many attempts from this address. Wait and try again.')
    else setError(body.attemptsLeft !== undefined ? `That code was not accepted. ${body.attemptsLeft} attempt${body.attemptsLeft === 1 ? '' : 's'} left.` : 'That code was not accepted.')
  }

  async function withPasskey() {
    setBusy(true)
    setError(null)
    const result = await passkey(purpose)
    setBusy(false)
    if (result.ok) onVerified()
    else setError(result.message ?? 'That passkey was not accepted.')
  }

  return (
    <div className="flex flex-col gap-md">
      {title && <p className="text-body-md text-on-surface">{title}</p>}
      {hasPasskey && (
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void withPasskey()}>
          Use a passkey
        </Button>
      )}
      {hasTotp && (
        <form onSubmit={submitCode} className="flex flex-wrap items-end gap-sm">
          <Input label="Code from your app, or a recovery code" name="code" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={20} required className="min-w-[14rem]" />
          <Button type="submit" disabled={busy}>Verify</Button>
        </form>
      )}
      {error && <p role="alert" className="font-mono text-label-sm text-error">{error}</p>}
    </div>
  )
}
