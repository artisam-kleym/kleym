'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'

async function call(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } })
  const body = response.status === 204 ? {} : ((await response.json().catch(() => ({}))) as Record<string, unknown>)
  if (!response.ok) {
    const errors = body.errors as { message: string }[] | undefined
    throw new Error(errors?.[0]?.message ?? (body.detail as string | undefined) ?? 'That did not work.')
  }
  return body
}

/** Run now / start in the wizard / enable / disable / delete — the verbs a template has (#82). */
export function TemplateActions({ id, enabled, compact = false }: { id: string; enabled: boolean; compact?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function act(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-sm">
      <Button variant="secondary" disabled={busy} onClick={() => router.push(`/campaigns/new?template=${id}`)} data-testid="template-start">
        {compact ? 'Start' : 'Start a campaign from this template'}
      </Button>
      <Button
        variant="secondary"
        disabled={busy}
        data-testid="template-run-now"
        onClick={() =>
          void act(async () => {
            const body = await call(`/api/templates/${id}/run`, { method: 'POST' })
            router.push(`/campaigns/new?draft=${String(body.campaignId)}`)
          })
        }
      >
        {compact ? 'Prepare' : 'Prepare a run now'}
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => void act(async () => { await call(`/api/templates/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !enabled }) }) })} data-testid="template-toggle">
        {enabled ? 'Disable' : 'Enable'}
      </Button>
      {!compact && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (!window.confirm('Delete this template? Campaigns it produced are kept.')) return
            void act(async () => {
              await call(`/api/templates/${id}`, { method: 'DELETE' })
              router.push('/templates')
            })
          }}
        >
          Delete
        </Button>
      )}
      {error && <span role="alert" className="text-label-md text-error">{error}</span>}
    </div>
  )
}

/** The editable parts of a template: recipients, cadence, hour. Terms are set when the template is saved. */
export function TemplateEditor({ id, recipientsCsv, cadence, runHour }: { id: string; recipientsCsv: string; cadence: string | null; runHour: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const kind = String(form.get('cadence') ?? 'none')
    const day = String(form.get('day') ?? '1')
    const next = kind === 'none' ? null : kind === 'daily' ? 'daily' : `${kind}:${day}`
    // An emptied hour keeps the current one: Number('') is 0, and 0 is midnight, not "unchanged".
    const hourRaw = String(form.get('runHour') ?? '').trim()
    const hour = hourRaw === '' ? runHour : Number(hourRaw)
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      setError('The hour is 0 to 23, UTC.')
      return
    }
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await call(`/api/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ recipientsCsv: String(form.get('recipientsCsv') ?? ''), cadence: next, runHour: hour }),
      })
      setSaved(true)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  const [kind, arg] = (cadence ?? 'none').split(':') as [string, string | undefined]
  return (
    <form onSubmit={save} className="mt-md flex flex-col gap-md">
      <label className="flex flex-col gap-xs">
        <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Recipients (label, amount, reference, category, note)</span>
        <textarea name="recipientsCsv" rows={8} defaultValue={recipientsCsv} className="rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface" data-testid="template-recipients" />
        <span className="font-mono text-label-sm text-on-surface-variant">
          The same CSV the wizard takes. Labels, never keys — a Stellar address or a seed in any cell is refused. A payroll system can replace this list through the API.
        </span>
      </label>
      <div className="flex flex-wrap items-end gap-md">
        <label className="flex flex-col gap-xs">
          <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Schedule</span>
          <select name="cadence" defaultValue={kind} className="min-h-11 rounded-lg border border-outline bg-surface px-3 font-mono text-label-md text-on-surface" data-testid="template-cadence">
            <option value="none">By hand only</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label className="flex flex-col gap-xs">
          <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Day (weekly: 0 = Sunday; monthly: 1–28)</span>
          <input name="day" type="number" min={0} max={28} defaultValue={arg ?? '1'} className="min-h-11 w-24 rounded-lg border border-outline bg-surface px-3 font-mono text-label-md text-on-surface" />
        </label>
        <label className="flex flex-col gap-xs">
          <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Hour (UTC)</span>
          <input name="runHour" type="number" min={0} max={23} defaultValue={runHour} className="min-h-11 w-24 rounded-lg border border-outline bg-surface px-3 font-mono text-label-md text-on-surface" />
        </label>
        <Button type="submit" variant="secondary" disabled={busy}>Save</Button>
        {saved && <span className="text-label-md text-on-surface-variant">Saved.</span>}
        {error && <span role="alert" className="text-label-md text-error">{error}</span>}
      </div>
    </form>
  )
}
