import type { ReactNode } from 'react'
import { AmbientOrbs } from '@/components/ui'
import { Sidebar, type OrgOption } from './sidebar'

/** BRAND.md §4 layout: content offset by the sidebar, capped at 1440px. */
export function AppShell({
  children,
  organizations = [],
  activeOrganizationId = null,
}: {
  children: ReactNode
  organizations?: OrgOption[]
  activeOrganizationId?: string | null
}) {
  return (
    <>
      <AmbientOrbs variant="dashboard" />
      <Sidebar organizations={organizations} activeOrganizationId={activeOrganizationId} />
      <main className="mx-auto min-w-0 max-w-[1440px] px-margin-mobile py-lg md:px-lg md:py-xl lg:ml-64">
        {children}
      </main>
    </>
  )
}
