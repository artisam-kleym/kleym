import { getSessionUser } from '@/lib/auth/session'
import { env } from '@/lib/config/env'
import { CampaignWizard } from './wizard'

export const dynamic = 'force-dynamic'

/**
 * /campaigns/new — SPEC.md §5.3.
 *
 * A thin server shell. Everything below this line runs in the browser, because
 * everything below this line touches keys: a server component that generated
 * or held a seed would put it in the RSC payload, which is a response body
 * (AGENT.md §1).
 *
 * `APP_URL` is read here rather than in the client so the claim URLs written
 * into the CSV come from configuration rather than from `window.location`,
 * which a sender on a preview deployment would otherwise bake into every link.
 */
export default async function NewCampaignPage() {
  await getSessionUser()

  return (
    <>
      <h1 className="text-display-lg text-primary max-md:text-headline-md">New campaign</h1>
      <p className="mt-md max-w-2xl text-body-md text-on-surface-variant">
        Every link gets its own key, generated in this tab. We never see them — which is
        why the export in step 3 is the only copy that will ever exist.
      </p>

      <CampaignWizard
        appUrl={env.APP_URL}
        maxOpsPerBatch={env.MAX_OPS_PER_BATCH}
        maxLinksPerCampaign={env.MAX_LINKS_PER_CAMPAIGN}
        baseFeeStroops={env.BASE_FEE_STROOPS}
      />
    </>
  )
}
