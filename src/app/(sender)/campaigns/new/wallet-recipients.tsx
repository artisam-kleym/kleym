'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui'
import { parseWalletRecipients, walletCsvTemplate, type WalletRecipients as ImportedRecipients } from '@/lib/campaign/wallet-recipients'

export function WalletRecipients({ count, maxLinks, onImport, onPending }: {
  count: number; maxLinks: number; onImport: (rows: ImportedRecipients) => void; onPending: (error: string | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  function download() {
    const url = URL.createObjectURL(new Blob([walletCsvTemplate(Math.min(Math.max(count, 1), 10000))], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'kleym-wallet-recipients-template.csv'
    document.body.appendChild(anchor); anchor.click(); anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function upload(file: File) {
    const attempt = ++generation.current
    setBusy(true); setError(null); setFilename(null); onPending('Reading recipient CSV…')
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error('Insert a CSV file. Excel workbooks are not supported; save as CSV first.')
      if (file.size > 2_000_000) throw new Error('The CSV must be smaller than 2 MB.')
      const rows = parseWalletRecipients(await file.text(), maxLinks)
      if (attempt !== generation.current) return
      onImport(rows); setFilename(file.name)
    } catch (caught) {
      if (attempt !== generation.current) return
      const detail = caught instanceof Error ? caught.message : 'The CSV could not be read.'
      setError(detail); onPending(detail)
    } finally { if (attempt === generation.current) setBusy(false) }
  }
  return <section className="flex min-w-0 flex-col gap-sm rounded-lg border border-outline-variant/50 bg-surface-container-low p-md" aria-label="Assigned wallet CSV">
    <h3 className="text-label-md font-semibold text-on-surface">Assign each link to a wallet</h3>
    <p className="text-body-md text-on-surface-variant">Download the empty template. Fill Wallet Address from top to bottom; labels and amounts are optional. Leave the key, secret, claim URL and claim code columns empty. Each filled row becomes one link, in the same order.</p>
    <div className="flex flex-wrap gap-sm">
      <Button type="button" variant="secondary" onClick={download}>Download CSV template</Button>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Reading CSV…' : 'Insert attachment'}</Button>
      <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Insert recipient CSV" onChange={(e) => {
        const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ''
      }} />
    </div>
    {error && <p role="alert" className="break-words text-body-md text-error">{error}</p>}
    {filename && <p role="status" className="break-all text-body-md text-on-surface-variant">Imported {filename}. Review the assigned wallets and prize amounts below.</p>}
    <p className="text-body-sm text-on-surface-variant">The assigned wallet must approve the claim. The sender can reclaim after expiry. Check every address: assignments cannot change after registration.</p>
  </section>
}
