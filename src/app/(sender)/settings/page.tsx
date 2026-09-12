import { pageScope } from '@/lib/api/session-guard'
import { listApiKeys } from '@/lib/auth/api-key'
import { ApiKeys } from './api-keys'
import { PasswordChange } from './password-change'
import { Organisation } from './organisation'
import { listMembers } from '@/lib/api/organizations'

export const dynamic = 'force-dynamic'

/**
 * /settings — account and API keys. SPEC.md §6.6.
 *
 * The key list is rendered on the server from `listApiKeys`, which selects
 * prefix and timestamps and never `keyHash`. There is no endpoint and no query
 * anywhere that can return a key after the moment it was issued.
 */
export default async function SettingsPage() {
  const { user, org } = await pageScope()
  const [keys, members] = await Promise.all([listApiKeys(org.id), listMembers(org.id)])

  return (
    <>
      <h1 className="text-display-lg text-primary max-md:text-headline-md">Settings</h1>
      <p className="mt-md font-mono text-label-md text-on-surface-variant">
        Signed in as {user.username} · {org.name}
      </p>

      <section className="mt-2xl">
        <h2 className="text-headline-sm text-on-surface">Password</h2>
        <p className="mt-xs text-body-md text-on-surface-variant">
          Changing your password signs out every other session.
        </p>
        <PasswordChange />
      </section>

      <Organisation
        name={org.name}
        role={org.role}
        selfId={user.id}
        members={members.map((m) => ({ userId: m.userId, username: m.username, role: m.role, invited: m.invited, isActive: m.isActive }))}
        policy={{ approvalThreshold: org.approvalThreshold, approvalsRequired: org.approvalsRequired }}
        screeningUrl={org.screeningUrl}
      />

      <section className="mt-2xl">
        <h2 className="text-headline-sm text-on-surface">API keys</h2>
        <p className="mt-xs text-body-md text-on-surface-variant">
          Read-only access to this organisation&rsquo;s campaigns and links. Creating a campaign needs a
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
