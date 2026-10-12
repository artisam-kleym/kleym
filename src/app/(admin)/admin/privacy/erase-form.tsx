'use client'

import { useState, type FormEvent } from 'react'
import { Button, Input } from '@/components/ui'

export function EraseForm() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const email = String(new FormData(form).get('email') ?? '')
    if (!window.confirm('Redact every delivery to this address? This cannot be undone.')) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetch('/api/admin/privacy/erase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const body = (await response.json().catch(() => ({}))) as { redacted?: number; detail?: string }
      if (!response.ok) throw new Error(body.detail ?? 'That did not work.')
      setResult(`${body.redacted ?? 0} ${body.redacted === 1 ? 'delivery' : 'deliveries'} redacted.`)
      form.reset()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-lg flex max-w-[36rem] flex-wrap items-end gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
      <div className="min-w-[16rem] flex-1">
        <Input label="Address to erase" name="email" type="email" autoComplete="off" required />
      </div>
      <Button type="submit" disabled={busy}>{busy ? 'Erasing…' : 'Erase'}</Button>
      {result && <p role="status" className="w-full font-mono text-label-sm text-on-surface">{result}</p>}
      {error && <p role="alert" className="w-full font-mono text-label-sm text-error">{error}</p>}
    </form>
  )
}
