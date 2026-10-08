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
  'campaign.expiring_soon',
  'sponsor.low',
  'template.run_prepared',
  'template.run_failed',
] as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export interface WebhookPayloads {
  'campaign.created': { campaignId: string; name: string; network: string; assetCode: string; assetIssuer: string | null; amountPerLink: string; linkCount: number; expiresAt: string }
  'campaign.activated': { campaignId: string; linkCount: number }
  'batch.confirmed': { campaignId: string; batchId: string; sequence: number; transactionHash: string; links: number }
  /** `claimMemoType`/`claimMemo`: the deposit memo TX2 carried when claiming to an exchange (#75), null otherwise. */
  /** `receiptId` (#81): the signed receipt issued for this claim, fetched at `GET /api/campaigns/{id}/links/{linkId}/receipt`. */
  'link.claimed': { campaignId: string; linkId: string; ephemeralPublicKey: string; claimedBy: string; claimTxHash: string; claimedAt: string | null; observedAt?: string; timeSource?: 'ledger' | 'unavailable'; claimMemoType: string | null; claimMemo: string | null; receiptId: string | null }
  'campaign.reclaimed': { campaignId: string }
  /** Kleym stopped serving the links (#72). The balances are still claimable until `reclaimScheduledFor`. */
  'campaign.suspended': { campaignId: string; outstanding: number; outstandingAmount: string; assetCode: string; suspendedAt: string; reclaimScheduledFor: string }
  /** A campaign has expired with links unclaimed: the scheduled reclaim is ready for the sender to sign (#72, #78). */
  'campaign.reclaim_due': { campaignId: string; outstanding: number; outstandingAmount: string; assetCode: string; expiresAt: string }
  /** A scheduled template run (#82) prepared a DRAFT campaign; an operator must generate keys, export and sign it. Nothing has moved. */
  'template.run_prepared': { templateId: string; templateName: string; campaignId: string; scheduledFor: string; linkCount: number; amountPerLink: string; assetCode: string; totalAmount: string; approvalRequired: boolean }
  /** A scheduled run (#82) prepared nothing — an empty or over-long list, or terms the campaign schema refused. The schedule has moved on; the operator must fix the template. */
  'template.run_failed': { templateId: string; templateName: string; scheduledFor: string; reason: string }
  /** Within a week (or the first reminder point) of expiry with links still unclaimed (#78). Once per campaign. */
  'campaign.expiring_soon': { campaignId: string; outstanding: number; outstandingAmount: string; assetCode: string; expiresAt: string }
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
