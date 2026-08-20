import type { ReactNode } from 'react'
import { Icon } from './icon'

/**
 * BRAND.md §5.7. RESERVED for genuinely irreversible actions — the CSV gate
 * (#8) and reclaim confirmation (#13). Overuse destroys it: a warning shown on
 * every screen is read on none.
 */
export function WarningPanel({
  heading,
  children,
  consequence,
}: {
  heading: string
  children: ReactNode
  /** The irreversible clause, rendered in bold. Name what cannot be undone. */
  consequence?: string
}) {
  return (
    <div className="rounded-lg border border-error-container bg-error-container/30 p-md" role="alert">
      <div className="flex gap-sm">
        <Icon name="warning" size={20} filled className="shrink-0 text-error" />
        <div>
          <p className="text-body-md font-bold text-on-surface">{heading}</p>
          <p className="mt-1 text-body-md text-on-surface-variant">
            {children}
            {consequence && <span className="font-semibold text-on-surface"> {consequence}</span>}
          </p>
        </div>
      </div>
    </div>
  )
}
