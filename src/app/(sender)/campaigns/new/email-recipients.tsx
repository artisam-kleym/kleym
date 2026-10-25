'use client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import { emailCsvTemplate, parseEmailRecipients, type EmailRecipients as ImportedEmails } from '@/lib/campaign/email-recipients'

export function EmailRecipients({ count, maxLinks, onImport, onPending }: {
  count: number; maxLinks: number; onImport: (rows: ImportedEmails) => void; onPending: (error: string | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  useEffect(() => () => { generation.current++ }, [])
  const [error, setError] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  function download() {
    const url = URL.createObjectURL(new Blob([emailCsvTemplate(Math.min(Math.max(count, 1), 10000))], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'kleym-email-recipients-template.csv'
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function upload(file: File) {
    const attempt = ++generation.current
    setBusy(true); setError(null); setFilename(null); onPending('Reading recipient CSV…')
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error('Insert a CSV file. Save Excel workbooks as CSV first.')
      if (file.size > 2_000_000) throw new Error('The CSV must be smaller than 2 MB.')
      const rows = parseEmailRecipients(await file.text(), maxLinks)
      if (attempt !== generation.current) return
      onImport(rows); setFilename(file.name)
    } catch (caught) {
      if (attempt !== generation.current) return
      const detail = caught instanceof Error ? caught.message : 'The CSV could not be read.'
      setError(detail); onPending(detail)
    } finally { if (attempt === generation.current) setBusy(false) }
  }
  return <section aria-label="Recipient email CSV" className="flex min-w-0 flex-col gap-sm rounded-lg border border-outline-variant/50 bg-surface-container-low p-md">
    <h3 className="text-label-md font-semibold text-on-surface">Assign each link to an email</h3>
    <p className="text-body-md text-on-surface-variant">Fill Email Address from top to bottom. Labels and amounts are optional. Leave all key, secret, claim URL and claim code columns empty. Only assign recipients who expect this distribution.</p>
    <div className="flex flex-wrap gap-sm">
      <Button type="button" variant="secondary" onClick={download}>Download CSV template</Button>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Reading CSV…' : 'Insert attachment'}</Button>
      <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Insert email recipient CSV" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = '' }} />
    </div>
    {error && <p role="alert" className="break-words text-body-md text-error">{error}</p>}
    {filename && <p role="status" className="break-all text-body-md text-on-surface-variant">Imported {filename}. Review each email and prize below.</p>}
    <p className="text-body-sm text-on-surface-variant">Share claim links privately from your saved export. Zender sends verification codes only. Email addresses cannot change after registration. Email verification is a Kleym check, not a wallet lock on Stellar.</p>
  </section>
}
