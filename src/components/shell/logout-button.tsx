'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/icon'

/** Revoke the server session before discarding the authenticated browser view. */
export function LogoutButton() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  async function logout() {
    setPending(true)
    setError(false)
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) throw new Error('Logout failed')
      // A document navigation also discards Next's prefetched authenticated pages.
      window.location.replace('/login')
    } catch {
      setPending(false)
      setError(true)
    }
  }

  return (
    <div className="logout-control">
      <button
        type="button"
        onClick={logout}
        disabled={pending}
        className="logout-button"
      >
        <Icon name={pending ? 'refresh' : 'arrow_forward'} size={20} />
        {pending ? 'Logging out…' : 'Log out'}
      </button>
      {error && (
        <p role="alert">
          Could not log out. Check your connection and try again.
        </p>
      )}
    </div>
  )
}
