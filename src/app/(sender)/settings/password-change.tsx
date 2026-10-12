'use client'

import { useState, type FormEvent } from 'react'
import { Button, Input } from '@/components/ui'

export function PasswordChange() {
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    setDone(false)

    const form = event.currentTarget
    const data = new FormData(form)
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          current: String(data.get('current') ?? ''),
          next: String(data.get('next') ?? ''),
        }),
      })
      if (response.ok) {
        form.reset()
        setDone(true)
        return
      }
      const problem = await response.json().catch(() => null)
      setError(response.status === 429
        ? 'Too many attempts. Wait a few minutes and try again.'
        : (problem?.detail ?? 'That password could not be changed. Check the current password.'))
    } catch {
      setError('Connection lost. Check your connection and try changing the password again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-lg flex w-full min-w-0 max-w-[28rem] flex-col gap-md">
      <Input label="Current password" name="current" type="password" autoComplete="current-password" required />
      <Input
        label="New password"
        name="next"
        type="password"
        autoComplete="new-password"
        minLength={12}
        helper="At least 12 characters."
        required
      />

      {error && (
        <p role="alert" className="text-body-md text-error">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-body-md text-on-surface-variant">
          Password changed. Every other session has been signed out.
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto sm:self-start">
        {pending ? 'Changing…' : 'Change password'}
      </Button>
    </form>
  )
}
