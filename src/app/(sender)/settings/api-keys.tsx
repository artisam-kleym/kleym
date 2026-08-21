'use client'

import { useState, type FormEvent } from 'react'
import { Button, Input, Table, TableCell, TableHead, TableRow, WarningPanel } from '@/components/ui'

interface KeyRow {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

/**
 * The issued key is held in component state and nowhere else — not in
 * localStorage, not in a URL, not re-fetched. Navigating away loses it, which
 * is the honest behaviour: the server stores only an argon2 hash and genuinely
 * cannot show it again. BRAND.md §8 — name the consequence before it happens.
 */
export function ApiKeys({ initialKeys }: { initialKeys: KeyRow[] }) {
  const [keys, setKeys] = useState(initialKeys)
  const [issued, setIssued] = useState<{ name: string; key: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const form = event.currentTarget
    const name = String(new FormData(form).get('name') ?? '').trim()

    const response = await fetch('/api/settings/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const body = await response.json().catch(() => null)

    if (!response.ok) {
      setError(body?.detail ?? body?.errors?.[0]?.message ?? 'That key could not be created.')
      setPending(false)
      return
    }

    form.reset()
    setCopied(false)
    setIssued({ name: body.name, key: body.key })
    setKeys((current) => [
      { id: body.id, name: body.name, prefix: body.prefix, lastUsedAt: null, revokedAt: null, createdAt: new Date().toISOString() },
      ...current,
    ])
    setPending(false)
  }

  async function revoke(id: string) {
    setError(null)
    const response = await fetch(`/api/settings/api-keys/${id}`, { method: 'DELETE' })
    if (!response.ok && response.status !== 404) {
      setError('That key could not be revoked. Try again.')
      return
    }
    setKeys((current) =>
      current.map((key) => (key.id === id ? { ...key, revokedAt: new Date().toISOString() } : key)),
    )
    // A revoked key must not stay on screen as the thing just issued.
    setIssued(null)
  }

  return (
    <div className="mt-lg flex flex-col gap-lg">
      <form onSubmit={create} className="flex max-w-md items-end gap-sm">
        <Input label="Key name" name="name" maxLength={60} required className="flex-1" placeholder="CI reporting" />
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create key'}
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-body-md text-error">
          {error}
        </p>
      )}

      {issued && (
        <div className="flex flex-col gap-sm">
          <WarningPanel
            heading={`Copy ${issued.name} now`}
            consequence="This key will never be shown again."
          >
            Kleym stores only a hash of it, so nobody — including us — can retrieve it
            later. If you lose it, revoke the key and create another.
          </WarningPanel>

          <div className="flex items-center gap-sm">
            <code className="flex-1 overflow-x-auto rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface">
              {issued.key}
            </code>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(issued.key).then(() => setCopied(true))
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">No API keys yet.</p>
      ) : (
        <Table>
          <TableHead columns={['Name', 'Prefix', 'Last used', 'Status', 'Actions']} />
          <tbody>
          {keys.map((key) => (
            <TableRow key={key.id}>
              <TableCell>{key.name}</TableCell>
              <TableCell>
                <code className="font-mono text-label-sm text-on-surface-variant">{key.prefix}…</code>
              </TableCell>
              <TableCell>{key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never'}</TableCell>
              <TableCell>{key.revokedAt ? 'Revoked' : 'Active'}</TableCell>
              <TableCell>
                {!key.revokedAt && (
                  <Button type="button" variant="tertiary" onClick={() => void revoke(key.id)}>
                    Revoke
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ')
}
