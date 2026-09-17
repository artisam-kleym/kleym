'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'

/** "Save as template" (#82): the campaign's terms and its links' labels become a template. */
export function SaveTemplate({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const source = await fetch(`/api/campaigns/${campaignId}/template`)
      if (!source.ok) throw new Error('The campaign’s terms could not be read.')
      const prefill = (await source.json()) as { name: string; terms: unknown; recipientsCsv: string }
      const name = window.prompt('Template name', prefill.name)
      if (!name) return
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, terms: prefill.terms, recipientsCsv: prefill.recipientsCsv }),
      })
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
      if (!response.ok) {
        const errors = body.errors as { message: string }[] | undefined
        throw new Error(errors?.[0]?.message ?? (body.detail as string | undefined) ?? 'The template could not be saved.')
      }
      router.push(`/templates/${String(body.id)}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The template could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-sm">
      <Button variant="secondary" disabled={busy} onClick={() => void save()} data-testid="save-template">Save as template</Button>
      {error && <span role="alert" className="text-label-md text-error">{error}</span>}
    </span>
  )
}
