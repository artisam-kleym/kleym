/** /login/sso — find the organisation's IdP by handle and go there (#46). */
import { AuthShell } from '@/components/shell/auth-shell'

export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  idp: 'Your identity provider did not complete the sign-in. Try again, or ask your administrator.',
  'link-required':
    'An account with that email already exists in Kleym. Sign in with your password, then link single sign-on from Settings.',
  inactive: 'That account is deactivated.',
}

export default async function SsoLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; handle?: string }>
}) {
  const params = await searchParams
  const error = params.error ? (ERRORS[params.error] ?? ERRORS.idp) : null
  return (
    <AuthShell>
      <h1 className="text-headline-lg text-primary">
        Sign in with your organisation
      </h1>
      <p className="mt-sm text-body-md text-on-surface-variant">
        Enter your organisation&rsquo;s sign-in handle. You will be sent to its
        identity provider and back.
      </p>
      {error && (
        <p role="alert" className="mt-md font-mono text-label-sm text-error">
          {error}
        </p>
      )}
      <form
        action="/api/auth/sso/start"
        method="get"
        className="mt-lg flex flex-col gap-md"
      >
        <label className="flex flex-col gap-xs">
          <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
            Organisation handle
          </span>
          <input
            name="handle"
            defaultValue={params.handle ?? ''}
            required
            minLength={2}
            maxLength={39}
            pattern="[a-z0-9][a-z0-9-]*"
            autoCapitalize="none"
            className="rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface"
            placeholder="acme"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-3 font-mono text-label-md text-on-primary"
        >
          Continue
        </button>
      </form>
      <p className="mt-lg text-label-md text-on-surface-variant">
        <a href="/login" className="underline">
          Sign in with a password instead
        </a>
      </p>
    </AuthShell>
  )
}
