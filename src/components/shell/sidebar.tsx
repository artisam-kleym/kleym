'use client'

import { clsx } from 'clsx'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from '@/components/ui'
import { OrgSwitcher, type OrgOption } from './org-switcher'

export type { OrgOption }

interface NavItem {
  href: string
  label: string
  icon: IconName
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/campaigns', label: 'Campaigns', icon: 'campaign' },
  { href: '/templates', label: 'Templates', icon: 'pending_actions' },
  { href: '/approvals', label: 'Approvals', icon: 'verified_user' },
  { href: '/history', label: 'History', icon: 'history' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
]

function NavLinks({ pathname, mobile = false }: { pathname: string; mobile?: boolean }) {
  return (
    <>
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'flex items-center font-mono',
              mobile
                ? 'min-h-11 min-w-0 justify-center gap-xs rounded-lg px-xs py-sm text-label-sm'
                : 'gap-sm rounded-full px-4 py-3 text-label-md',
              'transition-all duration-200 active:scale-[0.98]',
              active
                ? 'bg-on-primary-container/15 text-on-primary'
                : 'text-primary-fixed-dim hover:bg-on-primary-container/10 hover:text-on-primary',
            )}
          >
            <Icon name={item.icon} size={20} />
            {item.label}
          </Link>
        )
      })}
    </>
  )
}

export function Sidebar({
  organizations,
  activeOrganizationId,
}: {
  organizations: OrgOption[]
  activeOrganizationId: string | null
}) {
  const pathname = usePathname()

  return (
    <>
      {/* §4: fixed 256px from lg up. */}
      <nav
        aria-label="Main"
        className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col gap-lg bg-primary-container p-lg lg:flex"
      >
        <Link href="/dashboard" className="flex items-center gap-sm text-on-primary">
          {/* §9.6: the brand mark is `toll`, everywhere. */}
          <Icon name="toll" size={24} filled />
          <span className="text-headline-md">Kleym</span>
        </Link>
        <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
        <div className="flex flex-col gap-xs">
          <NavLinks pathname={pathname} />
        </div>
      </nav>

      {/* Below lg, a bottom bar. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 bg-primary-container px-sm py-2 lg:hidden"
      >
        <NavLinks pathname={pathname} mobile />
      </nav>
    </>
  )
}
