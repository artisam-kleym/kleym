import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './icon'

type Variant = 'primary' | 'secondary' | 'tertiary' | 'claim'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  icon?: IconName
  children: ReactNode
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-action hover:bg-action-hover text-action-on shadow-sm',
  secondary:
    'bg-surface border border-outline-variant text-primary shadow-sm hover:border-primary/50',
  tertiary:
    'bg-transparent border border-outline-variant text-on-surface hover:bg-surface-container-high',
  /*
   * BRAND.md §5.1: the hard offset shadow and tactile press are the signature
   * moment of the product and appear ONLY on the claim button. Do not spread
   * this variant to other primaries — its force comes from being unique.
   */
  claim:
    'bg-action hover:bg-action-hover text-action-on shadow-[0_4px_0_#4D6787] ' +
    'hover:-translate-y-0.5 active:translate-y-1 active:shadow-none',
}

export function Button({ variant = 'primary', icon, children, className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-sm rounded-lg px-4 py-3',
        'font-mono text-label-md font-semibold transition-all duration-200',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // 44px minimum touch target — BRAND.md §10.
        'min-h-11',
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  /** Required: an icon-only control is unusable without it (BRAND.md §10). */
  label: string
  size?: 'md' | 'sm'
}

export function IconButton({ icon, label, size = 'md', className, ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg text-on-surface-variant',
        'transition-colors duration-200 hover:bg-surface-container-high',
        // Both reach the 44px touch target; the small variant does it with
        // padding, since BRAND.md §10 flags the 32px table buttons as too small.
        size === 'md' ? 'h-10 w-10' : 'h-8 w-8 p-1 sm:h-8 sm:w-8',
        'min-h-11 min-w-11 sm:min-h-0 sm:min-w-0',
        className,
      )}
      {...props}
    >
      <Icon name={icon} size={size === 'md' ? 20 : 18} />
    </button>
  )
}
