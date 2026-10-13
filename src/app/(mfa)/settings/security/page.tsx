/**
 * /settings/security — second factors (#47).
 *
 * Outside the sender layout on purpose: a session whose organisation
 * requires a factor the user lacks (`enrol-required`) can reach THIS page
 * and the enrolment routes, and nothing else. A signed-in session reaches it
 * too, to add or remove factors.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { resolveSession } from '@/lib/auth/session'
import { factorsOf } from '@/lib/auth/mfa/factors'
import { AuthShell } from '@/components/shell/auth-shell'
import { Security } from './security'

export const dynamic = 'force-dynamic'

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>
}) {
  const session = await resolveSession()
  if (!session) redirect('/login')
  if (session.state === 'mfa-pending') redirect('/login/mfa')
  const [factors, params] = await Promise.all([
    factorsOf(session.user.id),
    searchParams,
  ])
  const required = session.state === 'enrol-required' || params.required === '1'

  return (
    <AuthShell wide authenticated>
      <h1 className="text-headline-lg text-primary">Second factor</h1>
      <p className="mt-sm text-body-md text-on-surface-variant">
        {required
          ? 'Your organisation requires a second factor for your role. Enrol one to continue.'
          : 'An authenticator app, a passkey, or both. Signing a campaign, reclaiming funds and issuing an API key ask for a fresh factor each time.'}
      </p>
      <Security
        username={session.user.username}
        state={session.state}
        totp={
          factors.totp
            ? { confirmedAt: factors.totp.confirmedAt.toISOString() }
            : null
        }
        passkeys={factors.passkeys.map((p) => ({
          id: p.id,
          name: p.name,
          createdAt: p.createdAt.toISOString(),
          lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
        }))}
        recoveryCodesLeft={factors.recoveryCodesLeft}
      />
      {session.state === 'ok' && (
        <p className="mt-xl text-label-md text-on-surface-variant">
          <Link href="/settings" className="underline">
            Back to settings
          </Link>
        </p>
      )}
    </AuthShell>
  )
}
