import type { ReactNode } from 'react'
import { Sidebar, type OrgOption } from './sidebar'

/** BRAND.md §4 layout: content offset by the sidebar, capped at 1440px. */
export function AppShell({
  children,
  organizations = [],
  activeOrganizationId = null,
  isAdmin = false,
}: {
  children: ReactNode
  organizations?: OrgOption[]
  activeOrganizationId?: string | null
  isAdmin?: boolean
}) {
  return (
    <div className="product-ui">
      <a href="#app-content" className="app-skip-link">
        Skip to content
      </a>
      <Sidebar
        organizations={organizations}
        activeOrganizationId={activeOrganizationId}
        isAdmin={isAdmin}
      />
      <main
        id="app-content"
        tabIndex={-1}
        className="product-main mx-auto min-w-0 max-w-[1440px] px-margin-mobile py-lg md:px-lg md:py-xl lg:ml-64"
      >
        {children}
      </main>
    </div>
  )
}
