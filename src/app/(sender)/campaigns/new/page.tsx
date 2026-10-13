import { PageHeading } from '@/components/ui/page-heading'
import { pageScope } from '@/lib/api/session-guard'
import { env } from '@/lib/config/env'
import { stellarMetadata } from '@/lib/stellar/network'
import { networkWorkspaces } from '@/lib/stellar/network-workspaces'
import { loadReissueSource } from '@/lib/api/outstanding'
import { prefillFromDraft, prefillFromTemplate } from '@/lib/api/templates'
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
export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { org } = await pageScope()
  const params = await searchParams
  const reissueId = typeof params.renew === 'string' ? params.renew : typeof params.reissue === 'string' ? params.reissue : null
  // Reissue (#78): the source campaign's terms, or why not. Decided in the loader, not here.
  const { reissue, refused } = reissueId ? await loadReissueSource(reissueId, org.id) : { reissue: null, refused: null }
  // Template (#82): a fresh run of a template, or a prepared DRAFT to finish. Decided in the loader.
  const templateId = typeof params.template === 'string' ? params.template : null
  const draftId = typeof params.draft === 'string' ? params.draft : null
  const template = draftId
    ? await prefillFromDraft(draftId, org.id, env.MAX_LINKS_PER_CAMPAIGN)
    : templateId
      ? await prefillFromTemplate(templateId, org.id, env.MAX_LINKS_PER_CAMPAIGN)
      : null
  const templateRefused = (draftId || templateId) && !template ? 'That template run could not be found, or it has already been continued.' : null

  return (
    <>
      <PageHeading icon="add" tone="mint">New campaign</PageHeading>
      {refused && (
        <p role="alert" className="mt-md max-w-2xl text-body-md text-error">{refused}</p>
      )}
      {templateRefused && (
        <p role="alert" className="mt-md max-w-2xl text-body-md text-error">{templateRefused}</p>
      )}
      <p className="mt-md max-w-2xl text-body-md text-on-surface-variant">
        Every link gets its own key, generated in this tab. We never see them — which is
        why the export in step 3 is the only copy that will ever exist.
      </p>

      {!refused && !templateRefused && <CampaignWizard
        stellar={stellarMetadata(env.STELLAR_NETWORK)}
        networkWorkspaces={networkWorkspaces(env.STELLAR_NETWORK, env.APP_URL, env.TESTNET_APP_URL, env.MAINNET_APP_URL)}
        appUrl={env.APP_URL}
        maxOpsPerBatch={env.MAX_OPS_PER_BATCH}
        maxLinksPerCampaign={env.MAX_LINKS_PER_CAMPAIGN}
        baseFeeStroops={env.BASE_FEE_STROOPS}
        screening={org.screeningUrl !== null}
        reissue={reissue}
        template={template}
      />}
    </>
  )
}
