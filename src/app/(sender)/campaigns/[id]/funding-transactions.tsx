'use client'

import { useEffect, useState } from 'react'

type Batch = { sequence: number; status: string; transactionHash: string | null }
const PAGE_SIZE = 10

/** Public funding receipts only; the existing endpoint enforces campaign ownership. */
export function FundingTransactions({ campaignId, network }: { campaignId: string; network: string }) {
  const [batches, setBatches] = useState<Batch[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/campaigns/${campaignId}/batches`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<{ batches: Batch[] }> })
      .then(body => { if (!Array.isArray(body.batches)) throw new Error(); if (!controller.signal.aborted) { setBatches(body.batches); setPage(0); setError(false) } })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [campaignId, attempt])
  return <section className="mt-lg min-w-0 rounded-xl border border-outline-variant/50 p-md" aria-labelledby="funding-heading">
    <h2 id="funding-heading" className="text-headline-sm">Funding transactions</h2>
    <p className="mt-xs text-body-md text-on-surface-variant">Public transaction hashes for this campaign’s funding batches. Share these for verification; keep the secrets CSV private.</p>
    <button type="button" className="mt-sm min-h-11 text-primary underline" onClick={() => { setError(false); setAttempt(value => value + 1) }}>Refresh funding status</button>
    {error ? <p role="alert">Funding status could not be loaded. Try Refresh funding status.</p> : batches === null ? <p role="status">Loading funding status…</p> : batches.length === 0 ? <p>No funding batch has been prepared yet.</p> : <ol className="mt-md space-y-md">
      {batches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(batch => <li key={batch.sequence} className="min-w-0">
        <p className="font-semibold">Batch {batch.sequence} · {batch.status.toLowerCase()}</p>
        {batch.transactionHash ? <a data-testid="funding-transaction-hash" className="mt-xs block break-all font-mono text-label-md text-primary underline" href={`https://stellar.expert/explorer/${network === 'public' ? 'public' : 'testnet'}/tx/${batch.transactionHash}`} target="_blank" rel="noopener noreferrer">{batch.transactionHash}</a> : <p className="text-body-md text-on-surface-variant">No submitted transaction yet.</p>}
      </li>)}
    </ol>}
    {batches && batches.length > PAGE_SIZE && <div className="mt-md flex flex-wrap items-center gap-md">
      <button type="button" className="min-h-11 text-primary underline disabled:opacity-50" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous funding batches</button>
      <span>Page {page + 1} of {Math.ceil(batches.length / PAGE_SIZE)}</span>
      <button type="button" className="min-h-11 text-primary underline disabled:opacity-50" disabled={(page + 1) * PAGE_SIZE >= batches.length} onClick={() => setPage(value => value + 1)}>Next funding batches</button>
    </div>}
  </section>
}
