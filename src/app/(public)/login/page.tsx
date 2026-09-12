import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { LoginForm } from './login-form'
import { AmbientOrbs, Icon } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  // Already signed in — no reason to show a login form.
  if (await getSessionUser()) redirect('/dashboard')

  return (
    <>
      <AmbientOrbs variant="claim" />
      <main className="mx-auto flex min-h-screen max-w-[440px] flex-col justify-center px-margin-mobile">
        <div className="mb-xl flex items-center gap-sm text-primary">
          <Icon name="toll" size={32} filled />
          <span className="text-headline-md">Kleym</span>
        </div>
        <h1 className="text-headline-lg text-primary">Sign in</h1>
        <p className="mt-sm text-body-md text-on-surface-variant">
          Manage your campaigns and claim links.
        </p>
        <LoginForm />
        <p className="mt-lg text-label-md text-on-surface-variant">
          Your organisation uses single sign-on? <a href="/login/sso" className="underline">Sign in with your organisation</a>.
        </p>
      </main>
    </>
  )
}
