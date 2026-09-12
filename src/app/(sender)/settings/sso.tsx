'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Table, TableCell, TableHead, TableRow, WarningPanel } from '@/components/ui'

export interface SsoView {
  id: string
  handle: string
  issuer: string
  clientId: string
  scopes: string
  subjectClaim: string
  groupsClaim: string
  ssoOnly: boolean
  defaultRole: string
  mappings: { group: string; role: string }[]
}

export interface ScimTokenRow {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  revokedAt: string | null
}

const ROLES = ['VIEWER', 'OPERATOR', 'APPROVER', 'OWNER']

/**
 * Single sign-on and SCIM (#46), as an Owner sets them up. The client secret
 * goes to the server once and is never shown again; the SCIM token is
 * shown once, from component state. The redirect URI and SCIM base are
 * what the IdP administrator pastes on their side.
 */
export function SingleSignOn({ connection, redirectUri, scimBase, scimTokens, owner, linked, handleForLink }: {
  connection: SsoView | null
  redirectUri: string
  scimBase: string
  scimTokens: ScimTokenRow[]
  owner: boolean
  /** Whether the signed-in user already has an identity on this connection. */
  linked: boolean
  handleForLink: string | null
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState<string | null>(null)

  async function call(path: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } })
      const body = response.status === 204 ? {} : ((await response.json().catch(() => ({}))) as Record<string, unknown>)
      if (!response.ok) {
        const errors = body.errors as { path: string; message: string }[] | undefined
        throw new Error(errors?.[0] ? `${errors[0].path}: ${errors[0].message}` : ((body.detail as string | undefined) ?? 'That did not work.'))
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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    const mappings = String(f.get('mappings') ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const at = l.lastIndexOf('=')
        return { group: l.slice(0, at).trim(), role: l.slice(at + 1).trim().toUpperCase() }
      })
      .filter((m) => m.group && ROLES.includes(m.role))
    const secret = String(f.get('clientSecret') ?? '')
    await call('/api/org/sso', {
      method: 'PUT',
      body: JSON.stringify({
        handle: String(f.get('handle') ?? ''), issuer: String(f.get('issuer') ?? ''), clientId: String(f.get('clientId') ?? ''),
        ...(secret ? { clientSecret: secret } : {}),
        scopes: String(f.get('scopes') ?? 'openid profile email'), subjectClaim: String(f.get('subjectClaim') ?? 'sub'), groupsClaim: String(f.get('groupsClaim') ?? 'groups'),
        ssoOnly: f.get('ssoOnly') === 'on', defaultRole: String(f.get('defaultRole') ?? 'VIEWER'), mappings,
      }),
    })
  }

  async function issueToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    const body = await call('/api/org/sso/scim-tokens', { method: 'POST', body: JSON.stringify({ name }) })
    if (body?.token) setIssued(String(body.token))
    event.currentTarget?.reset?.()
  }

  return (
    <section className="mt-2xl">
      <h2 className="text-headline-sm text-on-surface">Single sign-on</h2>
      <p className="mt-xs text-body-md text-on-surface-variant">
        OpenID Connect with your identity provider (Entra ID, Okta, Google Workspace…), and SCIM 2.0 so your
        provider creates, updates and — within one request — deprovisions members. Identities link on the
        provider&rsquo;s stable subject id, never on an email address.
      </p>

      {connection && (
        <p className="mt-sm text-body-md text-on-surface-variant">
          Connected: handle <span className="font-mono">{connection.handle}</span> · {connection.issuer}
          {connection.ssoOnly && ' · password sign-in disabled for members'}
          {!linked && handleForLink && (
            <> · <a className="underline" href={`/api/auth/sso/start?handle=${encodeURIComponent(handleForLink)}&purpose=link`}>Link my account to single sign-on</a></>
          )}
          {linked && ' · your account is linked'}
        </p>
      )}

      {owner && (
        <form onSubmit={save} className="mt-md grid grid-cols-1 gap-md md:grid-cols-2">
          <Input label="Sign-in handle" name="handle" defaultValue={connection?.handle ?? ''} required pattern="[a-z0-9][a-z0-9-]{1,38}" placeholder="acme" />
          <Input label="Issuer URL" name="issuer" type="url" defaultValue={connection?.issuer ?? ''} required placeholder="https://login.microsoftonline.com/<tenant>/v2.0" />
          <Input label="Client ID" name="clientId" defaultValue={connection?.clientId ?? ''} required />
          <Input label={connection ? 'Client secret (leave blank to keep)' : 'Client secret'} name="clientSecret" type="password" autoComplete="off" required={!connection} />
          <Input label="Scopes" name="scopes" defaultValue={connection?.scopes ?? 'openid profile email'} />
          <Input label="Subject claim (sub for Okta/Google, oid for Entra)" name="subjectClaim" defaultValue={connection?.subjectClaim ?? 'sub'} />
          <Input label="Groups claim" name="groupsClaim" defaultValue={connection?.groupsClaim ?? 'groups'} />
          <label className="flex flex-col gap-xs">
            <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Default role</span>
            <select name="defaultRole" defaultValue={connection?.defaultRole ?? 'VIEWER'} className="rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-xs md:col-span-2">
            <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Group → role mappings, one per line: group=ROLE</span>
            <textarea name="mappings" rows={3} defaultValue={(connection?.mappings ?? []).map((m) => `${m.group}=${m.role}`).join('\n')} className="rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface" placeholder={'treasury-approvers=APPROVER\ntreasury-admins=OWNER'} />
          </label>
          <label className="flex items-center gap-sm font-mono text-label-md text-on-surface md:col-span-2">
            <input type="checkbox" name="ssoOnly" defaultChecked={connection?.ssoOnly ?? false} className="h-5 w-5" />
            SSO only — refuse password sign-in for this organisation&rsquo;s members (enforced server-side)
          </label>
          <div className="md:col-span-2">
            <Button type="submit" variant="secondary" disabled={busy}>{connection ? 'Save connection' : 'Connect'}</Button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="mt-sm font-mono text-label-sm text-error">{error}</p>}

      <p className="mt-md font-mono text-label-sm text-on-surface-variant">
        Redirect URI for your provider: {redirectUri}
        <br />
        SCIM base URL: {scimBase}
      </p>

      {owner && connection && (
        <div className="mt-lg rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
          <h3 className="text-body-md font-bold text-on-surface">SCIM tokens</h3>
          {issued && (
            <WarningPanel heading="Copy the SCIM token now" consequence="It is shown once; we cannot show it again.">
              <p className="font-mono text-label-md break-all">{issued}</p>
            </WarningPanel>
          )}
          <form onSubmit={issueToken} className="mt-md flex flex-wrap items-end gap-sm">
            <Input label="Token name" name="name" maxLength={60} required placeholder="Okta provisioning" className="min-w-[14rem]" />
            <Button type="submit" variant="secondary" disabled={busy}>Issue token</Button>
          </form>
          {scimTokens.length > 0 && (
            <Table className="mt-md">
              <TableHead columns={['Name', 'Prefix', 'Last used', 'Status', '']} />
              <tbody>
                {scimTokens.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.name}</TableCell>
                    <TableCell className="font-mono text-label-sm">{t.prefix}…</TableCell>
                    <TableCell className="text-on-surface-variant">{t.lastUsedAt?.slice(0, 16).replace('T', ' ') ?? 'Never'}</TableCell>
                    <TableCell>{t.revokedAt ? 'Revoked' : 'Active'}</TableCell>
                    <TableCell>{!t.revokedAt && <Button type="button" variant="secondary" disabled={busy} onClick={() => void call(`/api/org/sso/scim-tokens/${t.id}`, { method: 'DELETE' })}>Revoke</Button>}</TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      )}
    </section>
  )
}
