'use client'

import { clsx } from 'clsx'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
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

function NavLinks({ pathname, mobile = false, onNavigate }: { pathname: string; mobile?: boolean; onNavigate?: () => void }) {
  return (
    <>
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'flex items-center font-mono',
              mobile
                ? 'min-h-11 min-w-0 gap-sm rounded-lg px-sm py-sm text-label-md'
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

      <MobileHeader key={pathname} pathname={pathname} organizations={organizations} activeOrganizationId={activeOrganizationId} />
    </>
  )
}

function MobileHeader({ pathname, organizations, activeOrganizationId }: { pathname: string; organizations: OrgOption[]; activeOrganizationId: string | null }) {
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    // Safari does not focus buttons after a pointer click. Escape must still
    // dismiss the open menu when focus remains outside the header.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      toggle.current?.focus()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])
  return (
    <header className="sticky top-0 z-20 border-b border-on-primary-container/20 bg-primary-container px-margin-mobile py-sm lg:hidden">
      <div className="flex min-h-11 items-center justify-between gap-md">
        <Link href="/dashboard" className="flex min-h-11 items-center gap-sm text-on-primary">
          <Icon name="toll" size={24} filled /><span className="text-headline-md">Kleym</span>
        </Link>
        <button ref={toggle} type="button" aria-expanded={open} aria-controls="mobile-main-menu"
          onClick={() => setOpen(!open)} className="flex min-h-11 items-center gap-sm rounded-lg px-sm font-mono text-label-md text-on-primary">
          <Icon name={open ? 'close' : 'menu'} />{open ? 'Close menu' : 'Menu'}
        </button>
      </div>
      <div id="mobile-main-menu" hidden={!open}>
        <nav aria-label="Main" className="grid grid-cols-2 gap-xs py-sm">
          <NavLinks pathname={pathname} mobile onNavigate={() => setOpen(false)} />
        </nav>
        <div className="min-w-0 border-t border-on-primary-container/20 py-sm">
          <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
        </div>
      </div>
    </header>
  )
}
