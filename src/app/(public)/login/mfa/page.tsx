/**
 * /login/mfa — the second factor, after the password (#47).
 *
 * Reached with a PENDING session: the password was right, the user has a
 * factor, and this session has not presented it. Nothing else is reachable
 * with that session, server-side, whatever the URL.
 */
import { redirect } from 'next/navigation'
import { resolveSession } from '@/lib/auth/session'
import { factorsOf } from '@/lib/auth/mfa/factors'
import { AuthShell } from '@/components/shell/auth-shell'
import { MfaLogin } from './mfa-login'

export const dynamic = 'force-dynamic'

export default async function MfaPage() {
  const session = await resolveSession()
  if (!session) redirect('/login')
  if (session.state === 'ok') redirect('/dashboard')
  if (session.state === 'enrol-required')
    redirect('/settings/security?required=1')
  const factors = await factorsOf(session.user.id)

  return (
    <AuthShell authenticated>
      <h1 className="text-headline-lg text-primary">Second factor</h1>
      <p className="mt-sm text-body-md text-on-surface-variant">
        Signed in as <span className="font-mono">{session.user.username}</span>.
        Present your second factor to continue.
      </p>
      <div className="mt-lg">
        <MfaLogin
          hasTotp={factors.totp !== null}
          hasPasskey={factors.passkeys.length > 0}
        />
      </div>
    </AuthShell>
  )
}
