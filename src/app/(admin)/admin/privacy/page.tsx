import { PageHeading } from '@/components/ui/page-heading'
import { DELIVERY_RETENTION_DAYS } from '@/lib/api/privacy'
import { EraseForm } from './erase-form'

export const dynamic = 'force-dynamic'

/**
 * `/admin/privacy` — the one place recipient PII is handled by hand.
 * Retention is automatic; this is for a request that cannot wait for it.
 */
export default function AdminPrivacyPage() {
  return (
    <>
      <PageHeading icon="verified_user" tone="pink">Privacy</PageHeading>
      <p className="mt-md max-w-2xl text-body-md text-on-surface-variant">
        The only recipient data Kleym holds is the address a link was emailed to. It is
        redacted automatically {DELIVERY_RETENTION_DAYS} days after the link or its campaign
        settles. An erasure request redacts every delivery to an address now, across all
        campaigns; the link&rsquo;s claim record and transaction hash are untouched, and the
        address is written nowhere — the audit row records only a count.
      </p>
      <p className="mt-sm max-w-2xl text-body-md text-on-surface-variant">
        A link that is still live stays gated after erasure but can no longer receive a code;
        its funds return to the sender at expiry.
      </p>
      <EraseForm />
    </>
  )
}
