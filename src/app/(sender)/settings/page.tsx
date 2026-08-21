import { getSessionUser } from '@/lib/auth/session'
import { listApiKeys } from '@/lib/auth/api-key'
import { ApiKeys } from './api-keys'
import { PasswordChange } from './password-change'

export const dynamic = 'force-dynamic'

/**
 * /settings — account and API keys. SPEC.md §6.6.
 *
 * The key list is rendered on the server from `listApiKeys`, which selects
 * prefix and timestamps and never `keyHash`. There is no endpoint and no query
 * anywhere that can return a key after the moment it was issued.
 */
export default async function SettingsPage() {
  const user = await getSessionUser()
  const keys = await listApiKeys(user!.id)

  return (
    <>
      <h1 className="text-display-lg text-primary max-md:text-headline-md">Settings</h1>
      <p className="mt-md font-mono text-label-md text-on-surface-variant">
        Signed in as {user?.username}
      </p>

      <section className="mt-2xl">
        <h2 className="text-headline-sm text-on-surface">Password</h2>
        <p className="mt-xs text-body-md text-on-surface-variant">
          Changing your password signs out every other session.
        </p>
        <PasswordChange />
      </section>

      <section className="mt-2xl">
        <h2 className="text-headline-sm text-on-surface">API keys</h2>
        <p className="mt-xs text-body-md text-on-surface-variant">
          Read-only access to your campaigns and links. Creating a campaign needs a
          browser, because the link keys are generated there and never reach us.
        </p>
        <ApiKeys initialKeys={keys.map(serialise)} />
      </section>
    </>
  )
}

function serialise(key: Awaited<ReturnType<typeof listApiKeys>>[number]) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
  }
}
