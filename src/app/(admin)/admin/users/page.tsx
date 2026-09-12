import { getSessionUser } from '@/lib/auth/session'
import { listUsers } from '@/lib/api/admin'
import { pendingInvitations } from '@/lib/api/invitations'
import { Table, TableCell, TableHead, TableRow } from '@/components/ui'
import { ActiveToggle } from './toggle'
import { CreateUser } from './create-user'
import { RevokeInvitation } from './revoke'

export const dynamic = 'force-dynamic'

/**
 * `/admin/users` — who can sign in. SPEC.md §5.4.
 *
 * Deactivating is the only destructive action here, and it takes effect on the
 * next request rather than whenever the session would have expired.
 */
export default async function AdminUsersPage() {
  const [me, users, invited] = await Promise.all([getSessionUser(), listUsers(), pendingInvitations()])
  // An invited account is inactive until redeemed; it is not "deactivated".
  const inactive = users.filter((user) => !user.isActive && !invited.has(user.id)).length

  return (
    <>
      <h1 className="text-display-lg text-primary max-md:text-headline-md">Users</h1>
      <p className="mt-md text-body-md text-on-surface-variant">
        {users.length} {users.length === 1 ? 'account' : 'accounts'}
        {inactive > 0 && `, ${inactive} deactivated`}. Deactivating ends every session that
        account holds and blocks sign-in. New accounts are created by invitation: the
        person sets their own password, and nobody here ever sees it.
      </p>

      <CreateUser />

      <Table className="mt-lg">
        <TableHead columns={['User', 'Role', 'Status', 'Campaigns', 'Sessions', '']} />
        <tbody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <span className="font-mono text-label-md">{user.username}</span>
              </TableCell>
              <TableCell className="font-mono text-label-sm">{user.role}</TableCell>
              <TableCell>
                {/*
                  * Label and dot, never colour alone — BRAND.md §2.4. A locked
                  * account is distinct from a deactivated one: locked is the
                  * failed-login backstop and clears itself.
                  */}
                <span
                  className={
                    user.isActive
                      ? 'inline-flex items-center gap-xs rounded-full border border-action/30 bg-action/20 px-3 py-1 font-mono text-label-sm text-[#00513c]'
                      : invited.has(user.id)
                        ? 'inline-flex items-center gap-xs rounded-full border border-accent-yellow/50 bg-accent-yellow/20 px-3 py-1 font-mono text-label-sm text-tertiary'
                        : 'inline-flex items-center gap-xs rounded-full border border-outline-variant/50 bg-surface-container-high px-3 py-1 font-mono text-label-sm text-on-surface-variant'
                  }
                >
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 rounded-full ${user.isActive ? 'bg-secondary' : invited.has(user.id) ? 'bg-accent-yellow' : 'bg-outline'}`}
                  />
                  {user.isActive ? 'Active' : invited.has(user.id) ? 'Invited' : 'Deactivated'}
                </span>
                {user.isLocked && (
                  <span className="ml-sm text-label-sm text-on-surface-variant">locked</span>
                )}
              </TableCell>
              <TableCell className="font-mono text-label-sm">{user.campaigns}</TableCell>
              <TableCell className="font-mono text-label-sm">{user.sessions}</TableCell>
              <TableCell>
                {invited.has(user.id) ? (
                  <RevokeInvitation userId={user.id} username={user.username} />
                ) : (
                  <ActiveToggle
                    userId={user.id}
                    username={user.username}
                    isActive={user.isActive}
                    self={me?.id === user.id}
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </>
  )
}
