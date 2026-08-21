import { getSessionUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/** Placeholder. The real dashboard is a later issue; this proves the gate. */
export default async function DashboardPage() {
  const user = await getSessionUser()
  return (
    <>
      <h1 className="text-display-lg text-primary max-md:text-headline-md">Dashboard</h1>
      <p className="mt-md font-mono text-label-md text-on-surface-variant">
        Signed in as {user?.username}
      </p>
    </>
  )
}
