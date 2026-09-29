/** Gate shared by session and WRITE APIs before any envelope or submission. */
import { env } from '@/lib/config/env'
import { assertHorizonNetwork } from './horizon'
import { sponsorFor } from './sponsors'

type CampaignContext = { network: string; sponsorPublicKey: string | null }

export function campaignContextProblem(campaign: CampaignContext): string | null {
  if (campaign.network !== env.STELLAR_NETWORK) {
    return 'This campaign belongs to a different Stellar network. Use its original deployment.'
  }
  if (!sponsorFor(campaign.sponsorPublicKey)) {
    return 'The sponsor bound to this campaign is unavailable. Contact support.'
  }
  return null
}

export async function stellarContextProblem(campaign: CampaignContext): Promise<string | null> {
  const problem = campaignContextProblem(campaign)
  if (problem) return problem
  try {
    await assertHorizonNetwork()
  } catch {
    // Provider exceptions can contain credentials/URLs. Never return them.
    return 'Stellar network verification is temporarily unavailable. Try again shortly.'
  }
  return null
}
