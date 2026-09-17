/**
 * Outbound webhook events. Issue #51.
 *
 * A webhook body is a request body to somebody else's log, so what an event
 * carries is fixed here, not assembled at the call site: identifiers, public
 * keys, amounts as strings, timestamps. Never a claim URL, never a fragment,
 * never a delivery address — `link.claimed` carries the ephemeral PUBLIC key,
 * which is what the ledger already shows. `assertPayloadSafe` in emit.ts
 * refuses anything that looks otherwise before it is stored.
 */
export const WEBHOOK_EVENTS = [
  'campaign.created',
  'campaign.activated',
  'batch.confirmed',
  'link.claimed',
  'campaign.reclaimed',
  'campaign.suspended',
  'campaign.reclaim_due',
  'sponsor.low',
] as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export interface WebhookPayloads {
  'campaign.created': { campaignId: string; name: string; network: string; assetCode: string; assetIssuer: string | null; amountPerLink: string; linkCount: number; expiresAt: string }
  'campaign.activated': { campaignId: string; linkCount: number }
  'batch.confirmed': { campaignId: string; batchId: string; sequence: number; transactionHash: string; links: number }
  'link.claimed': { campaignId: string; linkId: string; ephemeralPublicKey: string; claimedBy: string; claimTxHash: string; claimedAt: string }
  'campaign.reclaimed': { campaignId: string }
  /** Kleym stopped serving the links (#72). The balances are still claimable until `reclaimScheduledFor`. */
  'campaign.suspended': { campaignId: string; outstanding: number; outstandingAmount: string; assetCode: string; suspendedAt: string; reclaimScheduledFor: string }
  /** A suspended campaign has expired: the scheduled reclaim is ready for the sender to sign. */
  'campaign.reclaim_due': { campaignId: string; outstanding: number; outstandingAmount: string; assetCode: string; expiresAt: string }
  'sponsor.low': { sponsorPublicKey: string; spendable: string; threshold: string }
}

/** The envelope every delivery is wrapped in. `id` is the delivery id — the receiver's idempotency key. */
export interface WebhookEnvelope<E extends WebhookEvent = WebhookEvent> {
  id: string
  event: E
  createdAt: string
  organizationId: string
  data: WebhookPayloads[E]
}
