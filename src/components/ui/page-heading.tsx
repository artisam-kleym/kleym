import type { ReactNode } from 'react'
import { Icon, type IconName } from './icon'

export function PageHeading({
  children,
  icon,
  tone = 'mint',
}: {
  children: ReactNode
  icon: IconName
  tone?: 'mint' | 'yellow' | 'pink'
}) {
  return (
    <div className={`page-heading page-heading-${tone}`}>
      <span className="page-heading-icon" aria-hidden="true">
        <Icon name={icon} size={32} />
      </span>
      <h1>{children}</h1>
    </div>
  )
}
