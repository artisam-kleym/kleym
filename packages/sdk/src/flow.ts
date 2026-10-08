/**
 * A campaign, end to end, without a browser.
 *
 * 1. create the draft (terms and the sender's PUBLIC key)
 * 2. generate the link keys locally
 * 3. register their public halves
 * 4. write the secrets CSV to disk — the gate; nothing activates before this
 * 5. for each batch: prepare (server builds the envelope), sign locally with
 *    the sender key, submit
 *
 * No seed crosses the network at any step; the client throws if one would.
 */
import { Keypair } from '@stellar/stellar-sdk'
import { KleymClient, signBatchXdr, type CampaignTerms, type SubmittedBatch } from './client.js'
import { writeSecretsCsv } from './csv.js'
import { generateLinkKeys, publicHalves, type Attestation, type LinkKeys } from './keys.js'

export interface RunOptions {
  client: KleymClient
  terms: CampaignTerms
  /** Where the secrets file goes. The file IS the funds; keep it. */
  csvPath: string
  appUrl: string
  /** The sender's seed, from the caller's environment. Used to sign locally, never sent. */
  senderSecret: string
  labels?: (string | null)[]
  attestations?: (Attestation | null)[]
  /** Set to skip signing — e.g. to stop after the CSV and sign later. */
  sign?: boolean
  onBatch?: (batch: SubmittedBatch) => void
  /** Per-batch confirmation bound; expiry preserves the campaign and CSV for resume. */
  confirmationTimeoutMs?: number
  pollIntervalMs?: number
}

export interface RunResult {
  campaignId: string
  csvPath: string
  batches: SubmittedBatch[]
}

export async function createCampaignEndToEnd(opts: RunOptions): Promise<RunResult> {
  const { client } = opts
  const campaign = await client.createCampaign(opts.terms)
  const keys: LinkKeys = generateLinkKeys(opts.terms.linkCount, opts.labels ?? [], opts.attestations ?? [])
  await client.registerLinks(campaign.id, publicHalves(keys))
  await writeSecretsCsv(opts.csvPath, keys, opts.appUrl)
  await client.markExported(campaign.id)

  const batches: SubmittedBatch[] = []
  if (opts.sign === false) return { campaignId: campaign.id, csvPath: opts.csvPath, batches }

  const funded = await resumeCampaignFunding({ ...opts, campaignId: campaign.id })
  return { campaignId: campaign.id, csvPath: opts.csvPath, batches: funded }
}

export class FundingPendingError extends Error {
  constructor(readonly campaignId: string, readonly sequence: number, readonly transactionHash: string | null) {
    super(`Batch ${sequence} is awaiting ledger confirmation. Resume campaign ${campaignId}; keep its existing CSV.`)
  }
}

/** Resume the existing campaign without regenerating keys or overwriting its CSV. */
export async function resumeCampaignFunding(opts: Pick<RunOptions, 'client' | 'senderSecret' | 'onBatch' | 'confirmationTimeoutMs' | 'pollIntervalMs'> & { campaignId: string }): Promise<SubmittedBatch[]> {
  const { client, campaignId } = opts
  const timeout = opts.confirmationTimeoutMs ?? 120_000
  const interval = opts.pollIntervalMs ?? 1_000
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || !Number.isSafeInteger(interval) || interval <= 0) throw new Error('Invalid confirmation wait settings')
  const batches: SubmittedBatch[] = []
  let waitingFor: number | undefined
  let deadline = 0
  for (;;) {
    const detail = await client.getCampaign(campaignId)
    if (detail.senderPublicKey !== Keypair.fromSecret(opts.senderSecret).publicKey()) throw new Error('The signing wallet does not own this campaign')
    if (!detail.csvExportedAt) throw new Error('Save and attest the original CSV before funding')
    if (['CANCELLED', 'EXPIRED', 'RECLAIMED'].includes(detail.status)) throw new Error('This campaign cannot be funded')
    if (!Array.isArray(detail.batches)) throw new Error('Server does not expose funding confirmation status; upgrade before using the SDK')
    const pending = detail.batches.find((batch) => batch.status === 'SUBMITTED')
    if (pending) {
      if (waitingFor !== pending.sequence) { waitingFor = pending.sequence; deadline = Date.now() + timeout }
      if (Date.now() >= deadline) throw new FundingPendingError(campaignId, pending.sequence, pending.transactionHash)
      await new Promise((resolve) => setTimeout(resolve, interval))
      continue
    }
    waitingFor = undefined
    if (detail.batches.length > 0 && detail.batches.every((batch) => batch.status === 'CONFIRMED')) return batches
    const prepared = await client.prepareBatch(campaignId)
    const signed = signBatchXdr(prepared.xdr, prepared.networkPassphrase, opts.senderSecret)
    const submitted = await client.submitBatch(campaignId, prepared.sequence, signed)
    batches.push(submitted)
    opts.onBatch?.(submitted)
  }
}
