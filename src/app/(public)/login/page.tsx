import { redirect } from 'next/navigation'
import { resolveSession } from '@/lib/auth/session'
import { appEntryPath } from '@/lib/config/app-entry'
import { LoginForm } from './login-form'
import { AuthShell } from '@/components/shell/auth-shell'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  // Already signed in — no reason to show a login form.
  const session = await resolveSession()
  if (session) redirect(appEntryPath(session.state))

  return (
    <AuthShell>
      <h1 className="text-headline-lg text-primary">Sign in</h1>
      <p className="mt-sm text-body-md text-on-surface-variant">
        Manage your campaigns and claim links.
      </p>
      <LoginForm />
      <p className="mt-lg text-label-md text-on-surface-variant">
        Your organisation uses single sign-on?{' '}
        <a href="/login/sso" className="underline">
          Sign in with your organisation
        </a>
        .
      </p>
    </AuthShell>
  )
}
