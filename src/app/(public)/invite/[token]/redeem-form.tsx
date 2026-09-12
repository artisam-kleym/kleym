'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { Button, Input } from '@/components/ui'

export function RedeemForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')
    if (password !== String(form.get('confirm') ?? '')) {
      setError('The two passwords do not match.')
      return
    }
    setPending(true)
    setError(null)

    const response = await fetch('/api/invite/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    if (response.ok) {
      const body = (await response.json()) as { username: string }
      setDone(body.username)
      return
    }
    const problem = (await response.json().catch(() => null)) as { detail?: string; errors?: { message: string }[] } | null
    setError(
      response.status === 429
        ? 'Too many attempts. Wait a few minutes and try again.'
        : (problem?.errors?.[0]?.message ?? problem?.detail ?? 'That did not work.'),
    )
    setPending(false)
  }

  if (done) {
    return (
      <div className="mt-xl flex flex-col gap-md">
        <p role="status" className="text-body-md text-on-surface">
          Your account <span className="font-mono">{done}</span> is ready.
        </p>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-action px-4 py-3 font-mono text-label-md font-semibold text-action-on shadow-sm hover:bg-action-hover"
        >
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="mt-xl flex flex-col gap-md">
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        helper="At least 12 characters."
        minLength={12}
        required
        autoFocus
      />
      <Input label="Confirm password" name="confirm" type="password" autoComplete="new-password" required />
      {error && (
        <p role="alert" aria-live="polite" className="font-mono text-label-sm text-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} icon={pending ? 'refresh' : undefined}>
        {pending ? 'Saving' : 'Set password'}
      </Button>
    </form>
  )
}
