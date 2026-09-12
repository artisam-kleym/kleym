'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface OrgOption {
  id: string
  name: string
  role: string
}

/**
 * Which organisation this session acts in. Posts the choice and refreshes;
 * every page then reads the new scope from the server. One organisation is
 * the ordinary case and renders as a label, not a control.
 */
export function OrgSwitcher({
  organizations,
  activeOrganizationId,
}: {
  organizations: OrgOption[]
  activeOrganizationId: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const active = organizations.find((o) => o.id === activeOrganizationId) ?? organizations[0]
  if (!active) return null

  if (organizations.length === 1) {
    return (
      <p className="font-mono text-label-sm text-primary-fixed-dim" data-testid="org-name">
        {active.name} · {active.role.toLowerCase()}
      </p>
    )
  }

  async function onChange(organizationId: string) {
    setBusy(true)
    try {
      await fetch('/api/org/switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className="flex flex-col gap-xs font-mono text-label-sm text-primary-fixed-dim">
      Organisation
      <select
        value={active.id}
        disabled={busy}
        onChange={(e) => void onChange(e.target.value)}
        className="min-h-11 rounded-lg border border-on-primary-container/30 bg-primary-container px-3 py-2 font-mono text-label-md text-on-primary"
        data-testid="org-switcher"
      >
        {organizations.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} · {o.role.toLowerCase()}
          </option>
        ))}
      </select>
    </label>
  )
}
