'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Table, TableCell, TableHead, TableRow, WarningPanel } from '@/components/ui'

export interface EndpointRow {
  id: string
  url: string
  events: string[]
  disabledAt: string | null
  failures: number
  parked: number
  createdAt: string
}

/**
 * Outbound webhooks (#51). The signing key is shown once, from component
 * state, and never re-fetched — the server keeps it to sign deliveries but
 * has no endpoint that returns it. A parked delivery count and a disabled
 * endpoint are the organisation's view of a receiver that stopped answering.
 */
export function Webhooks({ endpoints, events, owner }: { endpoints: EndpointRow[]; events: readonly string[]; owner: boolean }) {
  const router = useRouter()
  const [issued, setIssued] = useState<{ url: string; signingKey: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function call(path: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } })
      const body = response.status === 204 ? {} : ((await response.json().catch(() => ({}))) as Record<string, unknown>)
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

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const url = String(form.get('url') ?? '').trim()
    const chosen = events.filter((e) => form.get(`event:${e}`) === 'on')
    const body = await call('/api/org/webhooks', { method: 'POST', body: JSON.stringify({ url, events: chosen }) })
    if (body?.signingKey) setIssued({ url, signingKey: String(body.signingKey) })
    event.currentTarget?.reset?.()
  }

  return (
    <section className="mt-2xl">
      <h2 className="text-headline-sm text-on-surface">Webhooks</h2>
      <p className="mt-xs text-body-md text-on-surface-variant">
        Kleym POSTs a signed JSON body to each endpoint when something happens. Payloads carry ids,
        public keys and transaction hashes — never a claim link. Failed deliveries are retried with backoff
        for about an hour, then parked; an endpoint that keeps failing is disabled until you re-enable it.
      </p>

      {issued && (
        <WarningPanel heading="Copy the signing key now" consequence="It is shown once; we cannot show it again.">
          <p className="font-mono text-label-md break-all">{issued.signingKey}</p>
          <p className="mt-xs text-label-sm text-on-surface-variant">
            Verify each delivery as HMAC-SHA256 over <span className="font-mono">timestamp.body</span> — see docs/api.md, or <span className="font-mono">verifyWebhook</span> in @kleym/sdk.
          </p>
        </WarningPanel>
      )}

      {owner && (
        <form onSubmit={add} className="mt-md flex flex-col gap-md">
          <div className="max-w-xl">
            <Input label="Endpoint URL" name="url" type="url" placeholder="https://payroll.example.com/kleym/webhooks" required />
          </div>
          <fieldset className="flex flex-wrap gap-md">
            <legend className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Events</legend>
            {events.map((e) => (
              <label key={e} className="flex items-center gap-sm font-mono text-label-md text-on-surface">
                <input type="checkbox" name={`event:${e}`} defaultChecked className="h-5 w-5" />
                {e}
              </label>
            ))}
          </fieldset>
          <Button type="submit" variant="secondary" disabled={busy} className="self-start">Add endpoint</Button>
        </form>
      )}

      {error && <p role="alert" className="mt-sm font-mono text-label-sm text-error">{error}</p>}

      {endpoints.length > 0 && (
        <Table className="mt-lg">
          <TableHead columns={['Endpoint', 'Events', 'Status', 'Parked', owner ? '' : ' ']} />
          <tbody>
            {endpoints.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono break-all">{e.url}</TableCell>
                <TableCell className="font-mono text-label-sm">{e.events.join(', ')}</TableCell>
                <TableCell className={e.disabledAt ? 'text-error' : ''}>{e.disabledAt ? 'Disabled after repeated failures' : 'Active'}</TableCell>
                <TableCell className={e.parked > 0 ? 'text-error' : 'text-on-surface-variant'}>{e.parked}</TableCell>
                <TableCell>
                  {owner && (
                    <span className="flex gap-sm">
                      {e.disabledAt && (
                        <Button type="button" variant="secondary" disabled={busy} onClick={() => void call(`/api/org/webhooks/${e.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: true }) })}>
                          Re-enable
                        </Button>
                      )}
                      <Button type="button" variant="secondary" disabled={busy} onClick={() => void call(`/api/org/webhooks/${e.id}`, { method: 'DELETE' })}>
                        Remove
                      </Button>
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  )
}
