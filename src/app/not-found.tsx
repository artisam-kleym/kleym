import Link from 'next/link'
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
      <Link href="/" className="product-create-link mt-lg">
        Go to home
      </Link>
    </AuthShell>
  )
}
