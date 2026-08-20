import { clsx } from 'clsx'

/** Icon names from BRAND.md §6. The font is subsetted to exactly these. */
export type IconName =
  | 'account_balance_wallet' | 'add' | 'arrow_back' | 'arrow_forward' | 'campaign'
  | 'check_circle' | 'close' | 'content_copy' | 'dashboard' | 'download'
  | 'expand_more' | 'history' | 'info' | 'link' | 'menu' | 'open_in_new'
  | 'pending_actions' | 'redeem' | 'refresh' | 'settings' | 'toll'
  | 'trending_up' | 'verified_user' | 'warning'

interface IconProps {
  name: IconName
  /** BRAND.md §6 sizes: 14 inline · 16 metadata · 18 buttons · 20 nav · 24 tiles · 32/48 claim */
  size?: 14 | 16 | 18 | 20 | 24 | 32 | 48
  filled?: boolean
  className?: string
}

export function Icon({ name, size = 20, filled = false, className }: IconProps) {
  return (
    <span
      // Decorative by default: meaning comes from the label beside it. An
      // icon-only control supplies aria-label on the BUTTON, not here.
      aria-hidden="true"
      className={clsx('icon', filled && 'icon-filled', className)}
      style={{ fontSize: `${size}px`, width: size, height: size }}
    >
      {name}
    </span>
  )
}
