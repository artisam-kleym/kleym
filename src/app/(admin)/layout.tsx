import { notFound } from 'next/navigation'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getSessionUser } from '@/lib/auth/session'
import { AppShell } from '@/components/shell/app-shell'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  /*
   * 404, not 403. A signed-in SENDER should not learn that /admin exists —
   * "forbidden" confirms the route, "not found" does not.
   */
  if (user.role !== 'ADMIN') notFound()

  return <AppShell>{children}</AppShell>
}
