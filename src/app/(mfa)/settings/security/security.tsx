'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Table, TableCell, TableHead, TableRow, WarningPanel } from '@/components/ui'
import { useStepUp } from '@/components/mfa/use-step-up'

interface Props {
  username: string
  state: 'ok' | 'enrol-required' | 'mfa-pending'
  totp: { confirmedAt: string } | null
  passkeys: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[]
  recoveryCodesLeft: number
}

/**
 * Enrolment. The TOTP key and the recovery codes are held in component
 * state for as long as this page is open and nowhere else: the server keeps
 * the key encrypted and only hashes of the codes, and has no endpoint that
 * shows either again.
 */
export function Security({ state, totp, passkeys, recoveryCodesLeft }: Props) {
  const router = useRouter()
  const stepUp = useStepUp()
  const [enrolment, setEnrolment] = useState<{ keyBase32: string; otpauth: string } | null>(null)
  const [recovery, setRecovery] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function call(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } })
      const body = response.status === 204 ? {} : ((await response.json().catch(() => ({}))) as Record<string, unknown>)
      return { ok: response.ok, status: response.status, body }
    } finally {
      setBusy(false)
    }
  }

  async function beginTotp() {
    const r = await call('/api/auth/mfa/totp/enrol', { method: 'POST' })
    if (!r.ok) return setError(String(r.body.detail ?? 'Could not start enrolment.'))
    setEnrolment({ keyBase32: String(r.body.keyBase32), otpauth: String(r.body.otpauth) })
  }

  async function confirmTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = String(new FormData(event.currentTarget).get('code') ?? '').trim()
    const r = await call('/api/auth/mfa/totp/confirm', { method: 'POST', body: JSON.stringify({ code }) })
    if (!r.ok) {
      return setError(r.status === 423 ? 'Too many wrong codes; try again in fifteen minutes.' : r.body.attemptsLeft !== undefined ? `That code was not accepted. ${r.body.attemptsLeft} attempts left.` : String(r.body.detail ?? 'That code was not accepted.'))
    }
    setEnrolment(null)
    setRecovery(r.body.recoveryCodes as string[])
    router.refresh()
  }

  async function removeTotp() {
    if (!(await stepUp.ensure())) return
    const r = await call('/api/auth/mfa/totp/remove', { method: 'POST' })
    if (!r.ok) return setError(String(r.body.detail ?? 'Could not remove the authenticator.'))
    router.refresh()
  }

  async function addPasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim() || 'Passkey'
    const options = await call('/api/auth/mfa/passkey/register/options', { method: 'POST' })
    if (!options.ok) return setError('Could not start passkey registration.')
    setBusy(true)
    try {
      const { startRegistration } = await import('@simplewebauthn/browser')
      const attestation = await startRegistration({ optionsJSON: options.body as never })
      const r = await call('/api/auth/mfa/passkey/register', { method: 'POST', body: JSON.stringify({ response: attestation, name }) })
      if (!r.ok) return setError(String(r.body.reason ?? 'The passkey was not accepted.'))
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The passkey prompt was cancelled.')
    } finally {
      setBusy(false)
    }
  }

  async function removePasskey(id: string) {
    if (!(await stepUp.ensure())) return
    const r = await call(`/api/auth/mfa/passkey/${id}`, { method: 'DELETE' })
    if (!r.ok) return setError('Could not remove the passkey.')
    router.refresh()
  }

  return (
    <div className="mt-lg flex flex-col gap-lg">
      {stepUp.panel}
      {error && <p role="alert" className="font-mono text-label-sm text-error">{error}</p>}

      {recovery && (
        <WarningPanel heading="Save these recovery codes now" consequence="Each works once, and they will never be shown again.">
          <p className="mt-xs text-label-sm text-on-surface-variant">Use one in place of a code if you lose the authenticator. Using one is logged.</p>
          <ul className="mt-sm grid grid-cols-2 gap-xs font-mono text-label-md">
            {recovery.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </WarningPanel>
      )}

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
        <h2 className="text-body-md font-bold text-on-surface">Authenticator app</h2>
        {totp ? (
          <div className="mt-sm flex flex-wrap items-center justify-between gap-md">
            <p className="text-body-md text-on-surface-variant">
              Enrolled {totp.confirmedAt.slice(0, 10)} · {recoveryCodesLeft} recovery code{recoveryCodesLeft === 1 ? '' : 's'} left
            </p>
            {state === 'ok' && <Button type="button" variant="secondary" disabled={busy} onClick={() => void removeTotp()}>Remove</Button>}
          </div>
        ) : enrolment ? (
          <div className="mt-sm flex flex-col gap-sm">
            <p className="text-body-md text-on-surface-variant">
              Add this key to your authenticator app (Google Authenticator, 1Password, Authy…), then enter the code it shows.
            </p>
            <code className="break-all rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md">{enrolment.keyBase32.replace(/(.{4})/g, '$1 ').trim()}</code>
            <a className="break-all font-mono text-label-sm text-primary underline" href={enrolment.otpauth}>Open in an authenticator app</a>
            <form onSubmit={confirmTotp} className="flex flex-wrap items-end gap-sm">
              <Input label="Six-digit code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required className="min-w-[10rem]" />
              <Button type="submit" disabled={busy}>Confirm</Button>
            </form>
          </div>
        ) : (
          <div className="mt-sm">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void beginTotp()}>Set up an authenticator app</Button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
        <h2 className="text-body-md font-bold text-on-surface">Passkeys</h2>
        <p className="mt-xs text-body-md text-on-surface-variant">A security key or the passkey on this device. The private half never leaves it.</p>
        {passkeys.length > 0 && (
          <Table className="mt-md">
            <TableHead columns={['Name', 'Added', 'Last used', state === 'ok' ? '' : ' ']} />
            <tbody>
              {passkeys.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-on-surface-variant">{p.createdAt.slice(0, 10)}</TableCell>
                  <TableCell className="text-on-surface-variant">{p.lastUsedAt?.slice(0, 10) ?? 'Never'}</TableCell>
                  <TableCell>{state === 'ok' && <Button type="button" variant="secondary" disabled={busy} onClick={() => void removePasskey(p.id)}>Remove</Button>}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        )}
        <form onSubmit={addPasskey} className="mt-md flex flex-wrap items-end gap-sm">
          <Input label="Name" name="name" maxLength={60} placeholder="YubiKey, this laptop…" className="min-w-[12rem]" />
          <Button type="submit" variant="secondary" disabled={busy}>Add a passkey</Button>
        </form>
      </section>
    </div>
  )
}
