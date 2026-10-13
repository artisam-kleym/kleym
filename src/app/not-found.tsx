import { env } from '@/lib/config/env'
import { AuthShell } from '@/components/shell/auth-shell'
import { PageHeading } from '@/components/ui/page-heading'

export default function NotFound() {
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
