import type { ReactNode } from 'react'
import { AmbientOrbs } from '@/components/ui'
import { Sidebar } from './sidebar'

/** BRAND.md §4 layout: content offset by the sidebar, capped at 1440px. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <AmbientOrbs variant="dashboard" />
      <Sidebar />
      <main className="mx-auto max-w-[1440px] px-margin-mobile py-xl pb-24 md:px-lg lg:ml-64 lg:pb-xl">
        {children}
      </main>
    </>
  )
}
