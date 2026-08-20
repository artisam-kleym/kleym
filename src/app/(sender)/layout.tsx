import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getSessionUser } from '@/lib/auth/session'
import { AppShell } from '@/components/shell/app-shell'

export const dynamic = 'force-dynamic'

/**
 * Gate for every sender route.
 *
 * Enforced in a layout rather than middleware on purpose: middleware runs on
 * the edge runtime, where the Prisma session lookup cannot. A cookie-presence
 * check there would be a check that a cookie EXISTS, not that it is valid —
 * which is not authentication.
 */
export default async function SenderLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <AppShell>{children}</AppShell>
}
