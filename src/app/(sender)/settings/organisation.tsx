'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Table, TableCell, TableHead, TableRow } from '@/components/ui'

export interface MemberView {
  userId: string
  username: string
  role: string
  invited: boolean
  isActive: boolean
}

const ROLES = ['VIEWER', 'OPERATOR', 'APPROVER', 'OWNER'] as const

/**
 * The organisation's members, and what an Owner can do about them. Every
 * action here is refused server-side below Owner; the controls are hidden
 * for other roles only so the page is not a wall of disabled buttons.
 */
export function Organisation({
  name,
  role,
  selfId,
  members,
}: {
  name: string
  role: string
  selfId: string
  members: MemberView[]
}) {
  const router = useRouter()
  const owner = role === 'OWNER'
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ username: string; inviteUrl: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function call(path: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } })
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
      if (!response.ok) {
        const errors = body.errors as { message: string }[] | undefined
        throw new Error(errors?.[0]?.message ?? (body.detail as string | undefined) ?? 'That did not work.')
      }
      router.refresh()
      return body
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await call('/api/org', { method: 'PATCH', body: JSON.stringify({ name: String(form.get('name') ?? '') }) })
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const body = await call('/api/org/members', {
      method: 'POST',
      body: JSON.stringify({ username: String(form.get('username') ?? ''), role: String(form.get('role') ?? 'OPERATOR') }),
    })
    if (body?.inviteUrl) setIssued({ username: String(body.username), inviteUrl: String(body.inviteUrl) })
    event.currentTarget?.reset?.()
  }

  return (
    <section className="mt-2xl">
      <h2 className="text-headline-sm text-on-surface">Organisation</h2>
      <p className="mt-xs text-body-md text-on-surface-variant">
        Campaigns belong to <span className="font-mono">{name}</span>; every member sees them, and
        what each member may do depends on their role. You are {role === 'OWNER' ? 'an owner' : `a ${role.toLowerCase()}`}.
      </p>

      {owner && (
        <form onSubmit={rename} className="mt-md flex flex-wrap items-end gap-md">
          <div className="min-w-[14rem] flex-1">
            <Input label="Name" name="name" defaultValue={name} minLength={2} maxLength={80} required />
          </div>
          <Button type="submit" variant="secondary" disabled={busy}>Rename</Button>
        </form>
      )}

      <Table className="mt-lg">
        <TableHead columns={['Member', 'Role', 'Status', owner ? '' : ' ']} />
        <tbody>
          {members.map((m) => (
            <TableRow key={m.userId}>
              <TableCell>
                <span className="font-mono">{m.username}</span>
                {m.userId === selfId && <span className="ml-sm text-label-sm text-on-surface-variant">you</span>}
              </TableCell>
              <TableCell>
                {owner ? (
                  <select
                    defaultValue={m.role}
                    disabled={busy}
                    aria-label={`Role for ${m.username}`}
                    onChange={(e) => void call(`/api/org/members/${m.userId}`, { method: 'PATCH', body: JSON.stringify({ role: e.target.value }) })}
                    className="min-h-11 rounded-lg border border-outline bg-surface-container-low px-3 py-2 font-mono text-label-md text-on-surface"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
                  </select>
                ) : (
                  <span className="font-mono text-label-sm">{m.role.charAt(0) + m.role.slice(1).toLowerCase()}</span>
                )}
              </TableCell>
              <TableCell className="text-on-surface-variant">{m.invited ? 'Invited' : m.isActive ? 'Active' : 'Deactivated'}</TableCell>
              <TableCell>
                {owner && (
                  <Button
                    type="button"
                    variant="tertiary"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Remove ${m.username} from ${name}?`)) void call(`/api/org/members/${m.userId}`, { method: 'DELETE' })
                    }}
                  >
                    Remove
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>

      {owner && (
        <form onSubmit={add} className="mt-md flex flex-wrap items-end gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
          <div className="min-w-[12rem] flex-1">
            <Input label="Username" name="username" helper="An existing account joins now; a new one is invited." required minLength={3} maxLength={64} />
          </div>
          <div className="flex flex-col gap-xs">
            <label htmlFor="add-member-role" className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Role</label>
            <select id="add-member-role" name="role" defaultValue="OPERATOR" className="min-h-11 rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface">
              {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          <Button type="submit" disabled={busy}>Add member</Button>
        </form>
      )}

      {issued && (
        <div className="mt-md rounded-xl border border-accent-yellow/50 bg-accent-yellow/10 p-md">
          <p className="text-body-md text-on-surface">
            <span className="font-mono">{issued.username}</span> has been invited. Send them this link — it works once and this is the only time it is shown:
          </p>
          <p className="mt-sm break-all rounded-lg bg-surface-container-lowest p-md font-mono text-label-sm">{issued.inviteUrl}</p>
          <Button type="button" variant="tertiary" className="mt-sm" onClick={() => setIssued(null)}>Done</Button>
        </div>
      )}

      {error && <p role="alert" className="mt-sm font-mono text-label-sm text-error">{error}</p>}
    </section>
  )
}
