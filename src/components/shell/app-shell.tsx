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
      <main className="mx-auto max-w-[1440px] px-margin-mobile py-xl pb-32 md:px-lg lg:ml-64 lg:pb-xl">
        {children}
      </main>
    </>
  )
}
