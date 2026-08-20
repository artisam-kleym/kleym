import { clsx } from 'clsx'

/**
 * BRAND.md §2.4 / §10: status is NEVER carried by colour alone. Every chip
 * pairs a colour with a text label and a dot, so it survives colour blindness
 * and greyscale printing.
 */
export type Status = 'active' | 'expired' | 'claimed' | 'failed' | 'pending' | 'reclaimed'

const STYLES: Record<Status, { chip: string; dot: string; label: string }> = {
  active: { chip: 'bg-action/20 border-action/30 text-[#00513c]', dot: 'bg-secondary', label: 'Active' },
  expired: {
    chip: 'bg-surface-variant border-outline-variant/50 text-on-surface-variant',
    dot: 'bg-outline',
    label: 'Expired',
  },
  claimed: {
    chip: 'bg-secondary-container border-secondary-container text-on-secondary-container',
    dot: 'bg-secondary',
    label: 'Claimed',
  },
  failed: {
    chip: 'bg-error-container border-error-container text-on-error-container',
    dot: 'bg-error',
    label: 'Failed',
  },
  pending: {
    chip: 'bg-surface-container-high border-outline-variant/50 text-on-surface-variant',
    dot: 'bg-outline',
    label: 'Pending',
  },
  reclaimed: {
    chip: 'bg-surface-container-high border-outline-variant/50 text-on-surface-variant',
    dot: 'bg-primary-container',
    label: 'Reclaimed',
  },
}

export function StatusChip({ status, className }: { status: Status; className?: string }) {
  const style = STYLES[status]
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-xs rounded-full border px-2 py-1',
        'font-mono text-label-sm',
        style.chip,
        className,
      )}
    >
      <span aria-hidden="true" className={clsx('h-1.5 w-1.5 rounded-[50%]', style.dot)} />
      {style.label}
    </span>
  )
}
