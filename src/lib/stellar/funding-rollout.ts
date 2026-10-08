import { env } from '@/lib/config/env'

/** Only gates NEW funding. Existing claims, refunds and confirmation recovery remain available. */
export function newFundingProblem(network: string, fundingMode: string): string | null {
  if (network === 'public' && env.MAINNET_DISTRIBUTION_ENABLED !== true) {
    return 'New Mainnet distributions are not enabled. Complete the release review before funding.'
  }
  if (fundingMode === 'SPONSORED' && env.SPONSORED_FUNDING_ENABLED !== true) {
    return 'New sponsored funding is paused. Contact the campaign operator before funding.'
  }
  return null
}
