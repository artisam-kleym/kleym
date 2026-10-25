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

/** The host only: a callback URL may carry a token in its path. */
function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'the configured callback'
  }
}

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
  policy,
  screeningUrl,
  mfaPolicy,
  reportingCurrency,
  currencies,
}: {
  name: string
  role: string
  selfId: string
  members: MemberView[]
  policy: { approvalThreshold: string | null; approvalsRequired: number }
  screeningUrl: string | null
  mfaPolicy: 'OFF' | 'APPROVERS' | 'ALL'
  /** Accounting export (#80): the currency journal lines are valued in, and what this deployment can price. */
  reportingCurrency: string
  currencies: string[]
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

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const threshold = String(form.get('approvalThreshold') ?? '').trim()
    await call('/api/org', {
      method: 'PATCH',
      body: JSON.stringify({
        approvalThreshold: form.get('enabled') === 'on' && threshold ? threshold : null,
        approvalsRequired: Number(form.get('approvalsRequired') ?? 1) || 1,
      }),
    })
  }

  async function saveScreening(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const url = String(form.get('screeningUrl') ?? '').trim()
    await call('/api/org', { method: 'PATCH', body: JSON.stringify({ screeningUrl: url || null }) })
  }

  async function saveReportingCurrency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await call('/api/org', { method: 'PATCH', body: JSON.stringify({ reportingCurrency: String(form.get('reportingCurrency') ?? 'USD') }) })
  }

  async function saveMfaPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await call('/api/org', { method: 'PATCH', body: JSON.stringify({ mfaPolicy: String(form.get('mfaPolicy') ?? 'OFF') }) })
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
    <section className="mt-xl">
      <h2 className="text-headline-sm text-on-surface">Organisation</h2>
      <p className="mt-xs text-body-md text-on-surface-variant">
        Campaigns belong to <span className="font-mono">{name}</span>; every member sees them, and
        what each member may do depends on their role. You are {role === 'OWNER' ? 'an owner' : `a ${role.toLowerCase()}`}.
      </p>

      {owner && (
        <form onSubmit={rename} className="mt-md grid grid-cols-1 sm:flex sm:flex-wrap sm:items-end gap-md">
          <div className="min-w-0 sm:min-w-[14rem] flex-1">
            <Input label="Name" name="name" defaultValue={name} minLength={2} maxLength={80} required />
          </div>
          <Button type="submit" variant="secondary" disabled={busy}>Rename</Button>
        </form>
      )}

      <div className="mt-lg rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
        <h3 className="text-body-md font-bold text-on-surface">Dual control</h3>
        <p className="mt-xs text-body-md text-on-surface-variant">
          {policy.approvalThreshold === null
            ? 'Off. Any operator can sign a campaign alone.'
            : `On. A campaign worth ${policy.approvalThreshold} or more (amount per link × links, in units of the campaign's own asset — 100 gates 100 USDC and 100 XLM alike) needs ${policy.approvalsRequired} ${policy.approvalsRequired === 1 ? 'approval' : 'approvals'} from approvers other than its creator before a batch can be signed. Approvals are bound to the terms: change any and they are needed again. Each campaign keeps the policy it was created under, so loosening this later affects only new campaigns.`}
        </p>
        {owner && (
          <form onSubmit={savePolicy} className="mt-md grid grid-cols-1 sm:flex sm:flex-wrap sm:items-end gap-md">
            <label className="flex items-center gap-sm font-mono text-label-md text-on-surface">
              <input type="checkbox" name="enabled" defaultChecked={policy.approvalThreshold !== null} className="h-5 w-5" />
              Require approval
            </label>
            <div className="min-w-[10rem]">
              <Input label="From value" name="approvalThreshold" inputMode="decimal" defaultValue={policy.approvalThreshold ?? ''} placeholder="e.g. 1000" pattern="^\d+(\.\d{1,7})?$" />
            </div>
            <div className="min-w-[8rem]">
              <Input label="Approvals" name="approvalsRequired" type="number" min={1} max={10} defaultValue={policy.approvalsRequired} />
            </div>
            <Button type="submit" variant="secondary" disabled={busy}>Save</Button>
          </form>
        )}
      </div>

      <div className="mt-lg rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
        <h3 className="text-body-md font-bold text-on-surface">Second factor policy</h3>
        <p className="mt-xs text-body-md text-on-surface-variant">
          {mfaPolicy === 'OFF'
            ? 'Off. Members may enrol a second factor; none is required to sign in.'
            : mfaPolicy === 'APPROVERS'
              ? 'Approvers and Owners must have a second factor to sign in. Enforced on every request from the moment it is set.'
              : 'Every member must have a second factor to sign in. Enforced on every request from the moment it is set.'}
        </p>
        {owner && (
          <form onSubmit={saveMfaPolicy} className="mt-md grid grid-cols-1 sm:flex sm:flex-wrap sm:items-end gap-md">
            <label className="flex flex-col gap-xs">
              <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Required for</span>
              <select name="mfaPolicy" defaultValue={mfaPolicy} className="rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-body-md md:text-label-md text-on-surface">
                <option value="OFF">Nobody</option>
                <option value="APPROVERS">Approvers and Owners</option>
                <option value="ALL">All members</option>
              </select>
            </label>
            <Button type="submit" variant="secondary" disabled={busy}>Save</Button>
          </form>
        )}
      </div>

      <div className="mt-lg rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
        <h3 className="text-body-md font-bold text-on-surface">Compliance screening</h3>
        <p className="mt-xs text-body-md text-on-surface-variant">
          {screeningUrl === null
            ? 'Off. Campaigns are signed without an external check.'
            : `On. Before any batch is signed, the campaign's terms and each recipient's reference fields are sent to ${safeHost(screeningUrl)}, which answers allow, hold or block. No answer, or an error, holds the campaign. Kleym ships the callback, not a screening provider — see docs/compliance.md for the contract.`}
        </p>
        {owner && (
          <form onSubmit={saveScreening} className="mt-md grid grid-cols-1 sm:flex sm:flex-wrap sm:items-end gap-md">
            <div className="min-w-0 sm:min-w-[18rem] flex-1">
              <Input label="Callback URL" name="screeningUrl" type="url" defaultValue={screeningUrl ?? ''} placeholder="https://compliance.example.com/kleym/screen" />
            </div>
            <Button type="submit" variant="secondary" disabled={busy}>Save</Button>
          </form>
        )}
        {owner && (
          <p className="mt-sm text-label-md text-on-surface-variant">
            Leave the field empty and save to switch screening off.{' '}
            <a className="underline" href="/api/org/compliance/export">Download the signed regulator export</a> for this organisation.
          </p>
        )}
      </div>

      <div className="mt-lg rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
        <h3 className="text-body-md font-bold text-on-surface">Accounting</h3>
        <p className="mt-xs text-body-md text-on-surface-variant">
          Every settled claim is valued in <span className="font-mono">{reportingCurrency}</span> at its own claim
          date — the rate is captured when the claim lands and never recomputed, so an export run twice is
          identical. Reclaims appear as reversals and network fees as their own lines. Changing the currency
          applies to claims settled from then on.
        </p>
        {owner && currencies.length > 1 && (
          <form onSubmit={saveReportingCurrency} className="mt-md grid grid-cols-1 sm:flex sm:flex-wrap sm:items-end gap-md">
            <label className="flex flex-col gap-xs">
              <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Reporting currency</span>
              <select name="reportingCurrency" defaultValue={reportingCurrency} className="min-h-11 rounded-lg border border-outline bg-surface px-3 font-mono text-body-md md:text-label-md text-on-surface">
                {currencies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="secondary" disabled={busy}>Save</Button>
          </form>
        )}
        <p className="mt-sm text-label-md text-on-surface-variant">
          <a className="underline" href="/api/org/accounting/export?format=csv" data-testid="accounting-export-csv">Download the journal export (CSV)</a>
          {' · '}
          <a className="underline" href="/api/org/accounting/export?format=json">JSON</a>
          {' — signed; verify with '}<span className="font-mono">pnpm audit:verify-export</span>.
        </p>
      </div>

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
        <form onSubmit={add} className="mt-md grid grid-cols-1 sm:flex sm:flex-wrap sm:items-end gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
          <div className="min-w-0 sm:min-w-[12rem] flex-1">
            <Input label="Username" name="username" helper="An existing account joins now; a new one is invited." required minLength={3} maxLength={64} />
          </div>
          <div className="flex flex-col gap-xs">
            <label htmlFor="add-member-role" className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Role</label>
            <select id="add-member-role" name="role" defaultValue="OPERATOR" className="min-h-11 rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-body-md md:text-label-md text-on-surface">
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
