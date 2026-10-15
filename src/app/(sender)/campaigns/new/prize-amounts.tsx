'use client'

import { useId, useState } from 'react'
import { Button, Input } from '@/components/ui'
import { isStellarAmount } from '@/lib/stellar/amount'

const PAGE_SIZE = 10

/** An indexed editor: row N is the same person as key/export/operation N. */
export function PrizeAmounts({ count, labels, wallets, amounts, defaultAmount, assetCode, disabled = false, readOnly = false, onAmount, onReset }: {
  count: number
  labels: string[]
  wallets?: string[]
  amounts: (string | null)[]
  defaultAmount: string
  assetCode: string
  disabled?: boolean
  readOnly?: boolean
  onAmount: (index: number, value: string) => void
  onReset: () => void
}) {
  const id = useId()
  const [expanded, setExpanded] = useState(() => amounts.slice(0, count).some((amount) => amount !== null))
  const [page, setPage] = useState(0)
  const active = amounts.slice(0, count)
  const custom = active.filter((amount) => amount !== null).length
  const invalid = active.findIndex((amount) => amount !== null && !isStellarAmount(amount))
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const start = currentPage * PAGE_SIZE
  const end = Math.min(count, start + PAGE_SIZE)
  const visible = expanded || custom > 0 || !!wallets?.length

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-lg border border-outline-variant/50 bg-surface-container-low p-md">
      <h3 id={`${id}-title`} className="text-label-md font-semibold text-on-surface">{readOnly ? 'Prize breakdown' : 'Prize amounts'}</h3>
      <p className="mt-xs text-body-md text-on-surface-variant">
        Default: <strong className="text-on-surface">{defaultAmount} {assetCode}</strong> per person.
        {' '}Set a custom prize for any person below. An empty field uses the default.
      </p>
      {disabled && <p className="mt-xs text-body-md text-on-surface-variant">Renewals keep the original returned prize amounts.</p>}
      {readOnly && <p className="mt-xs text-body-md text-on-surface-variant">Check each prize before signing. Use Back to change an amount.</p>}
      {!visible && (
        <Button type="button" variant="secondary" className="mt-md" disabled={disabled || count < 1} onClick={() => setExpanded(true)} aria-expanded={false} aria-controls={`${id}-list`}>
          Set individual amounts
        </Button>
      )}
      {visible && (
        <div id={`${id}-list`} className="mt-md" onFocusCapture={() => setExpanded(true)}>
          <p role="status" className="mb-md text-body-md text-on-surface-variant">
            {custom} custom {custom === 1 ? 'prize' : 'prizes'} · {Math.max(0, count - custom)} use the default
          </p>
          {invalid >= 0 && <p role="alert" className="mb-md text-body-md text-error">Person {invalid + 1} has an invalid amount. Correct it or clear the field before continuing.</p>}
          <ol start={start + 1} className="flex flex-col gap-md">
            {Array.from({ length: Math.max(0, end - start) }, (_, offset) => {
              const index = start + offset
              const amount = amounts[index] ?? null
              const name = labels[index] || `Person ${index + 1}`
              return (
                <li key={index} className="grid min-w-0 gap-sm rounded-lg border border-outline-variant/50 p-md sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
                  <div className="min-w-0">
                    <p className="break-words text-label-md font-semibold text-on-surface">{name}</p>
                    {wallets?.[index] && <p className="break-all font-mono text-body-sm text-on-surface-variant">{wallets[index]}</p>}
                    <p className="text-body-sm text-on-surface-variant">Link {index + 1} · {amount === null ? 'Default amount' : 'Custom amount'}</p>
                  </div>
                  <Input label={`Prize for ${name} (link ${index + 1}) in ${assetCode}`} name={`prize-${index + 1}`} inputMode="decimal" className="w-full min-w-0" value={amount ?? ''} placeholder={defaultAmount} disabled={disabled} readOnly={readOnly}
                    onChange={(event) => onAmount(index, event.target.value)}
                    helper={amount === null ? `Uses ${defaultAmount} ${assetCode}` : 'Clear to use the default.'}
                    error={amount !== null && !isStellarAmount(amount) ? 'Enter a positive amount with up to 7 decimal places within the Stellar limit.' : undefined} />
                </li>
              )
            })}
          </ol>
          {totalPages > 1 && (
            <nav aria-label="Prize list pages" className="mt-md flex flex-wrap items-center justify-between gap-sm">
              <Button type="button" variant="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous people</Button>
              <span role="status" className="text-body-sm text-on-surface-variant">People {start + 1}–{end} of {count}</span>
              <Button type="button" variant="secondary" disabled={currentPage + 1 >= totalPages} onClick={() => setPage(currentPage + 1)}>Next people</Button>
            </nav>
          )}
          {!readOnly && <Button type="button" variant="tertiary" className="mt-md" disabled={disabled || custom === 0} onClick={onReset}>Use default for everyone</Button>}
        </div>
      )}
    </section>
  )
}
