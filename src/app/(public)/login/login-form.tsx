'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button, Input } from '@/components/ui'

export function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: String(form.get('username') ?? ''),
        password: String(form.get('password') ?? ''),
      }),
    })

    if (response.ok) {
      router.push('/dashboard')
      return
    }

    /*
     * Whatever the server said, show one message. BRAND.md §8 asks errors to
     * name the fix, but here the honest fix really is "check both fields" —
     * telling the user which one was wrong would tell an attacker the same.
     */
    const problem = await response.json().catch(() => null)
    setError(
      response.status === 429
        ? 'Too many attempts. Wait a few minutes and try again.'
        : (problem?.detail ?? 'That username and password combination was not recognised.'),
    )
    setPending(false)
  }

  return (
    <form onSubmit={onSubmit} className="mt-xl flex flex-col gap-md">
      <Input label="Username" name="username" autoComplete="username" required autoFocus />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />

      {error && (
        // Announced, not just shown: a screen-reader user must learn the
        // attempt failed without re-reading the page (BRAND.md §10).
        <p role="alert" aria-live="polite" className="font-mono text-label-sm text-error">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending} icon={pending ? 'refresh' : undefined}>
        {pending ? 'Signing in' : 'Sign in'}
      </Button>
    </form>
  )
}
