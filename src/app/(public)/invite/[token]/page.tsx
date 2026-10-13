import { AuthShell } from '@/components/shell/auth-shell'
import { RedeemForm } from './redeem-form'

export const dynamic = 'force-dynamic'

/**
 * `/invite/[token]` — where an invited user sets their own password.
 *
 * The token is read from the path and posted to the redeem route; it is not
 * checked here, so this page renders identically for a valid, expired or
 * made-up token — the form's response is the only answer, and it is the same
 * answer for all three refusals.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return (
    <AuthShell>
      <h1 className="text-headline-lg text-primary">Choose your password</h1>
      <p className="mt-sm text-body-md text-on-surface-variant">
        You have been invited to Kleym. Set a password to finish creating your
        account.
      </p>
      <RedeemForm token={token} />
    </AuthShell>
  )
}
