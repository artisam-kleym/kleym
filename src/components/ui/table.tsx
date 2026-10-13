import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { Icon } from './icon'

/** §5.5. Wrapped in overflow-x-auto with min-w so it scrolls rather than squashing. */
export function Table({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Scrollable table"
      >
        <table
          className={clsx(
            'w-full min-w-[800px] border-collapse text-left',
            className,
          )}
        >
          {children}
        </table>
      </div>
      <p className="table-hint">
        <Icon name="arrow_forward" size={16} />
        Scroll sideways to see all columns.
      </p>
    </>
  )
}

export function TableHead({ columns }: { columns: string[] }) {
  return (
    <thead className="border-b border-outline-variant/40 bg-surface-container-low">
      <tr>
        {columns.map((column) => (
          <th
            key={column}
            scope="col"
            className="px-lg py-4 font-mono text-label-sm uppercase tracking-wider text-on-surface-variant"
          >
            {column}
          </th>
        ))}
      </tr>
    </thead>
  )
}

export function TableRow({ children }: { children: ReactNode }) {
  return (
    <tr className="border-b border-outline-variant/20 transition-colors hover:bg-surface-container-low">
      {children}
    </tr>
  )
}

export function TableCell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <td className={clsx('px-lg py-4 font-mono text-label-md', className)}>
      {children}
    </td>
  )
}

/** §5.5 progress cell. `expired` swaps the fill to outline-variant. */
export function ProgressCell({
  claimed,
  total,
  expired = false,
}: {
  claimed: number
  total: number
  expired?: boolean
}) {
  const percent = total === 0 ? 0 : Math.round((claimed / total) * 100)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between font-mono text-label-sm text-on-surface-variant">
        <span>
          {claimed} / {total} claimed
        </span>
        <span>{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${claimed} of ${total} claimed`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high"
      >
        <div
          className={clsx(
            'h-full rounded-full',
            // Bucketed to 5%: a width is dynamic and cannot be a fixed class
            // otherwise, and an inline style attribute is CSP-refused. The
            // exact value stays in aria-valuenow and the label above.
            // Clamped as well as bucketed: an out-of-range percent would name
            // a class that does not exist, leaving the fill unstyled at 0 —
            // where the inline style it replaced merely overflowed and clipped.
            `progress-${Math.min(100, Math.max(0, Math.round(percent / 5) * 5))}`,
            expired ? 'bg-outline-variant' : 'bg-action',
          )}
        />
      </div>
    </div>
  )
}

/**
 * §3: every Stellar address, hash or balance ID is mono, truncated, copyable.
 * Never render a raw 56-character key inline — it destroys the layout and is
 * unreadable anyway.
 */
export function StellarAddress({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  const short =
    value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value
  return (
    <span
      className={clsx(
        'font-mono text-label-sm text-on-surface-variant',
        className,
      )}
      title={value}
    >
      {short}
    </span>
  )
}
