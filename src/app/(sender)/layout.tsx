import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getSessionUser } from '@/lib/auth/session'
import { membershipsOf, resolveScope } from '@/lib/api/session-guard'
import { AppShell } from '@/components/shell/app-shell'

export const dynamic = 'force-dynamic'

/**
 * Gate for every sender route.
 *
 * Enforced in a layout rather than middleware on purpose: middleware runs on
 * the edge runtime, where the Prisma session lookup cannot. A cookie-presence
 * check there would be a check that a cookie EXISTS, not that it is valid —
 * which is not authentication.
 *
 * The organisation scope is resolved here too, from memberships, on every
 * request: a member of no organisation sees that rather than an empty
 * dashboard, and a removed membership stops being a scope at once.
 */
export default async function SenderLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const [org, memberships] = await Promise.all([resolveScope(user), membershipsOf(user.id)])
  const organizations = memberships.map((m) => ({ id: m.organization.id, name: m.organization.name, role: m.role }))

  return (
    <AppShell organizations={organizations} activeOrganizationId={org?.id ?? null}>
      {org ? (
        children
      ) : (
        <>
          <h1 className="text-display-lg text-primary max-md:text-headline-md">No organisation</h1>
          <p className="mt-md max-w-2xl text-body-md text-on-surface-variant">
            Your account is not a member of any organisation, so there are no campaigns to show.
            Ask an owner to add you, or an administrator to put you in one.
          </p>
        </>
      )}
    </AppShell>
  )
}
