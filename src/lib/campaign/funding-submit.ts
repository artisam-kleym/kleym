import { Networks, TransactionBuilder } from '@stellar/stellar-sdk'

/** A lost/duplicate response is not proof of a failed payment. Never sign or POST again here. */
export async function submitFundingBatch(input: { campaignId: string; sequence: number; signedXdr: string; network: 'testnet' | 'public' }): Promise<void> {
  let uncertain = false
  try {
    const response = await fetch(`/api/campaigns/${input.campaignId}/batches/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ sequence: input.sequence, signedXdr: input.signedXdr }),
    })
    if (response.ok) return
    const body = await response.json().catch(() => null)
    const detail = body?.detail ?? body?.errors?.[0]?.message ?? 'The batch was rejected.'
    if (response.status === 409 && /^A request with this Idempotency-Key is still (?:in progress\.|resolving\. Retry\.)$/.test(detail)) uncertain = true
    else throw new FundingRejected(detail)
  } catch (error) {
    if (error instanceof FundingRejected) throw error
    uncertain = true // Connection lost after POST: determine the outcome through reads.
  }
  if (!uncertain) return
  const expectedHash = TransactionBuilder.fromXDR(input.signedXdr, input.network === 'public' ? Networks.PUBLIC : Networks.TESTNET).hash().toString('hex')
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`/api/campaigns/${input.campaignId}/batches`, { cache: 'no-store' })
      if (response.ok) {
        const body = await response.json() as { batches?: { sequence: number; status: string; transactionHash: string | null; errorCode?: string | null }[] }
        const batch = body.batches?.find(b => b.sequence === input.sequence)
        if (batch?.transactionHash && batch.transactionHash !== expectedHash) throw new FundingRejected('The campaign reports a different funding transaction. Keep your CSV and review the campaign before signing again.')
        if (batch?.transactionHash === expectedHash && ['SUBMITTED', 'CONFIRMED'].includes(batch.status)) return
        if (batch?.status === 'FAILED') throw new FundingRejected(`The network rejected batch ${input.sequence}: ${batch.errorCode ?? 'transaction failed'}. Earlier funded links are preserved.`)
      }
    } catch (error) {
      if (error instanceof FundingRejected) throw error
      // Read failures remain uncertain; do not send another payment.
    }
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
  throw new Error('Funding is still being checked. Keep your CSV and open the campaign before signing again.')
}

class FundingRejected extends Error {}
