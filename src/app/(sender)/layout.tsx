import { PageHeading } from '@/components/ui/page-heading'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getSessionUser } from '@/lib/auth/session'
import { membershipsOf, resolveScope } from '@/lib/api/session-guard'
import { AppShell } from '@/components/shell/app-shell'
import { env } from '@/lib/config/env'

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
    <AppShell organizations={organizations} activeOrganizationId={org?.id ?? null} isAdmin={user.role === 'ADMIN'}>
      <aside role="status" className="mb-lg rounded-lg border border-outline-variant bg-surface-container-low px-md py-sm text-body-md">
        <strong>{env.STELLAR_NETWORK === 'testnet' ? 'Testnet · test funds' : 'Mainnet · real assets'}</strong>
        <span className="ml-sm text-on-surface-variant">{env.STELLAR_NETWORK === 'testnet' ? 'These assets have no financial value.' : 'Campaigns use real funds on Stellar Mainnet.'}</span>
      </aside>
      {org ? (
        children
      ) : (
        <>
          <PageHeading icon="account_balance_wallet" tone="mint">No organisation</PageHeading>
          <p className="mt-md max-w-2xl text-body-md text-on-surface-variant">
            Your account is not a member of any organisation, so there are no campaigns to show.
            Ask an owner to add you, or an administrator to put you in one.
          </p>
        </>
      )}
    </AppShell>
  )
}
