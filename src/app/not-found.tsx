import { env } from '@/lib/config/env'
import { connection } from 'next/server'
import { AuthShell } from '@/components/shell/auth-shell'
import { PageHeading } from '@/components/ui/page-heading'

export default async function NotFound() {
  // Next's standalone 404 build must not load application secrets.
  await connection()
  return (
    <AuthShell wide>
      <PageHeading icon="info" tone="yellow">
        Page not found
      </PageHeading>
      <p className="mt-lg text-body-md text-on-surface-variant">
        This page may have moved, or the address may be incorrect.
      </p>
      <a
        href={env.MARKETING_SITE_URL || '/'}
        className="product-create-link mt-lg"
      >
        Go to home
      </a>
    </AuthShell>
  )
}
