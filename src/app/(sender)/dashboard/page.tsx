import { getSessionUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/**
 * The sender's landing page.
 *
 * Still minimal — a fuller dashboard is not in any open issue — but it now
 * states SPEC.md §12's multi-tenancy limitation, which has no other home. A
 * sender who assumes a colleague can pick up their campaign would find out at
 * the worst possible moment: when they have lost the CSV and the colleague
 * cannot help.
 */
export default async function DashboardPage() {
  const user = await getSessionUser()
  return (
    <>
      <h1 className="text-display-lg text-primary max-md:text-headline-md">Dashboard</h1>
      <p className="mt-md font-mono text-label-md text-on-surface-variant">
        Signed in as {user?.username}
      </p>

      <div className="mt-lg max-w-2xl rounded-lg border border-outline-variant/50 bg-surface-container p-md">
        <p className="text-body-md font-bold text-on-surface">Campaigns belong to this account alone</p>
        <p className="mt-sm text-body-md text-on-surface-variant">
          There are no shared or organisation accounts. Nobody else can see, resend or
          reclaim a campaign you created — not a colleague, and not Kleym. If someone else
          needs to run a campaign, they need their own account.
        </p>
      </div>
    </>
  )
}
