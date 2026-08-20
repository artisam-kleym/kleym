import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { Icon, type IconName } from './icon'

/** §5.2 glass card — dashboard. */
export function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('glass-card p-lg', className)}>{children}</div>
}

/** §5.2 solid card — wizard. */
export function SolidCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-xl border border-outline-variant bg-surface-container-lowest p-lg', className)}>
      {children}
    </div>
  )
}

/** §5.2 claim panel — 4px accent-yellow bar pinned to the top edge. */
export function ClaimPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-2xl border-2 border-surface-variant',
        'bg-surface-container-lowest shadow-[0_12px_32px_rgba(26,43,62,0.08)]',
        className,
      )}
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-accent-yellow" />
      <div className="p-xl">{children}</div>
    </div>
  )
}

type Tint = 'yellow' | 'green' | 'pink'
const TINTS: Record<Tint, string> = {
  yellow: 'bg-accent-yellow/20 border-accent-yellow/50 text-tertiary',
  green: 'bg-secondary-container/30 border-secondary-container/50 text-secondary',
  pink: 'bg-accent-pink/20 border-accent-pink/50 text-error',
}

/** §5.3 metric card. */
export function MetricCard({
  label,
  value,
  unit,
  icon,
  tint = 'yellow',
  delta,
}: {
  label: string
  value: string
  unit?: string
  icon: IconName
  tint?: Tint
  delta?: string
}) {
  return (
    <GlassCard>
      <div className="flex items-start justify-between">
        <h3 className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
          {label}
        </h3>
        <span
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-[50%] border',
            TINTS[tint],
          )}
        >
          <Icon name={icon} size={20} />
        </span>
      </div>
      <div className="mt-xl flex items-baseline gap-2">
        <span className="text-display-lg text-primary">{value}</span>
        {unit && <span className="text-body-lg text-on-surface-variant">{unit}</span>}
      </div>
      {delta && (
        <p className="mt-sm flex items-center gap-1 font-mono text-label-sm text-secondary">
          <Icon name="trending_up" size={16} />
          {delta}
        </p>
      )}
    </GlassCard>
  )
}
