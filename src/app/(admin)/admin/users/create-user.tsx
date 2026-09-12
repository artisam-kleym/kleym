'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input } from '@/components/ui'

/**
 * Creates an account and shows its invitation link ONCE.
 *
 * The link is the only copy Kleym will ever produce — the server holds a
 * hash — so it is shown until dismissed and the admin is told so, the same
 * way a new API key is handled on /settings.
 */
export function CreateUser({ organizations }: { organizations: { id: string; name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ username: string; inviteUrl: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: String(form.get('username') ?? ''),
          role: String(form.get('role') ?? 'SENDER'),
          organizationId: String(form.get('organizationId') ?? ''),
          orgRole: String(form.get('orgRole') ?? 'OPERATOR'),
        }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        detail?: string; errors?: { message: string }[]
        user?: { username: string }; inviteUrl?: string; expiresAt?: string
      }
      if (!response.ok || !body.user || !body.inviteUrl || !body.expiresAt) {
        throw new Error(body.errors?.[0]?.message ?? body.detail ?? 'That did not work.')
      }
      setIssued({ username: body.user.username, inviteUrl: body.inviteUrl, expiresAt: body.expiresAt })
      setOpen(false)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.inviteUrl)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  if (issued) {
    return (
      <section className="mt-lg rounded-xl border border-accent-yellow/50 bg-accent-yellow/10 p-lg">
        <h2 className="text-headline-sm text-on-surface">Invitation for {issued.username}</h2>
        <p className="mt-xs text-body-md text-on-surface-variant">
          Send this link to them. It works once, until {new Date(issued.expiresAt).toUTCString()}, and
          this is the only time it will be shown — Kleym keeps a hash, not the link.
        </p>
        <p className="mt-md break-all rounded-lg bg-surface-container-lowest p-md font-mono text-label-sm text-on-surface" data-testid="invite-url">
          {issued.inviteUrl}
        </p>
        <div className="mt-md flex flex-wrap gap-sm">
          <Button type="button" icon="content_copy" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</Button>
          <Button type="button" variant="tertiary" onClick={() => { setIssued(null); setCopied(false) }}>
            Done
          </Button>
        </div>
      </section>
    )
  }

  if (!open) {
    return (
      <div className="mt-lg">
        <Button type="button" icon="add" onClick={() => setOpen(true)}>Invite a user</Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="mt-lg flex flex-wrap items-end gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
      <div className="min-w-[12rem] flex-1">
        <Input label="Username" name="username" autoComplete="off" required minLength={3} maxLength={64} autoFocus />
      </div>
      <div className="flex flex-col gap-xs">
        <label htmlFor="new-user-role" className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
          Role
        </label>
        <select
          id="new-user-role"
          name="role"
          defaultValue="SENDER"
          className="min-h-11 rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface"
        >
          <option value="SENDER">Sender</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      <div className="flex flex-col gap-xs">
        <label htmlFor="new-user-org" className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
          Organisation
        </label>
        <select
          id="new-user-org"
          name="organizationId"
          defaultValue={organizations[0]?.id ?? ''}
          className="min-h-11 rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface"
        >
          {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-xs">
        <label htmlFor="new-user-org-role" className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
          Org role
        </label>
        <select
          id="new-user-org-role"
          name="orgRole"
          defaultValue="OPERATOR"
          className="min-h-11 rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface"
        >
          <option value="VIEWER">Viewer</option>
          <option value="OPERATOR">Operator</option>
          <option value="APPROVER">Approver</option>
          <option value="OWNER">Owner</option>
        </select>
      </div>
      <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create invitation'}</Button>
      <Button type="button" variant="tertiary" onClick={() => setOpen(false)}>Cancel</Button>
      {error && (
        <p role="alert" className="w-full font-mono text-label-sm text-error">{error}</p>
      )}
    </form>
  )
}
