import type { ReactNode } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'

/**
 * The filter/paginate furniture `/campaigns` and `/history` share.
 *
 * Plain GET forms and links — no client component. The URL IS the state, so
 * a filtered, paged view survives reload, back, and being pasted to a
 * colleague; and the pages stay server components reading through the
 * ownership scope.
 */

export function FilterBar({ children, action }: { children: ReactNode; action: string }) {
  return (
    <form
      method="get"
      action={action}
      className="mt-lg flex flex-wrap items-end gap-md rounded-xl border border-outline-variant bg-surface-container-lowest p-md"
    >
      {children}
      <button
        type="submit"
        className="min-h-11 rounded-lg bg-action px-4 py-3 font-mono text-label-md font-semibold text-action-on shadow-sm hover:bg-action-hover"
      >
        Apply
      </button>
    </form>
  )
}

const FIELD = 'min-h-11 rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface'
const LABEL = 'font-mono text-label-sm uppercase tracking-wider text-on-surface-variant'

export function FilterField({
  label, name, children,
}: { label: string; name: string; children: ReactNode }) {
  return (
    <div className="flex min-w-[10rem] flex-1 flex-col gap-xs">
      <label htmlFor={`filter-${name}`} className={LABEL}>
        {label}
      </label>
      {children}
    </div>
  )
}

export function FilterInput(props: { name: string; type?: string; defaultValue?: string; placeholder?: string }) {
  return (
    <input
      id={`filter-${props.name}`}
      name={props.name}
      type={props.type ?? 'text'}
      defaultValue={props.defaultValue}
      placeholder={props.placeholder}
      className={FIELD}
    />
  )
}

export function FilterSelect({
  name, defaultValue, options, blank,
}: { name: string; defaultValue?: string; options: { value: string; label: string }[]; blank: string }) {
  return (
    <select id={`filter-${name}`} name={name} defaultValue={defaultValue ?? ''} className={FIELD}>
      <option value="">{blank}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

/**
 * Previous / next, carrying every other query parameter along so a filter
 * survives paging (acceptance criterion 2).
 */
export function Pagination({
  page, perPage, total, params, basePath,
}: { page: number; perPage: number; total: number; params: Record<string, string | undefined>; basePath: string }) {
  const pages = Math.max(1, Math.ceil(total / perPage))
  const href = (target: number) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
    search.set('page', String(target))
    return `${basePath}?${search.toString()}`
  }
  const link = (target: number, label: string, enabled: boolean) =>
    enabled ? (
      <Link href={href(target)} className="min-h-11 rounded-lg border border-outline-variant px-4 py-3 font-mono text-label-md text-primary hover:bg-surface-container-high">
        {label}
      </Link>
    ) : (
      <span aria-disabled="true" className="min-h-11 rounded-lg border border-outline-variant/40 px-4 py-3 font-mono text-label-md text-on-surface-variant/50">
        {label}
      </span>
    )

  return (
    <nav aria-label="Pagination" className={clsx('mt-md flex items-center justify-between gap-md')}>
      {link(page - 1, 'Previous', page > 1)}
      <span className="font-mono text-label-sm text-on-surface-variant">
        Page {page} of {pages} · {total} {total === 1 ? 'row' : 'rows'}
      </span>
      {link(page + 1, 'Next', page < pages)}
    </nav>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="mt-lg rounded-xl border border-dashed border-outline-variant p-lg text-center text-body-md text-on-surface-variant">
      {children}
    </p>
  )
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date)
}

/** Next hands `searchParams` as string | string[]; a filter wants one value. */
export function firstValues(params: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value
    if (first !== undefined) out[key] = first
  }
  return out
}
