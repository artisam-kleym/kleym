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

  // Prepare hands back the next unsigned batch until every one is submitted.
  for (;;) {
    let prepared
    try {
      prepared = await client.prepareBatch(campaign.id)
    } catch (error) {
      if (error instanceof Error && /already been submitted/.test(error.message)) break
      throw error
    }
    const signed = signBatchXdr(prepared.xdr, prepared.networkPassphrase, opts.senderSecret)
    const submitted = await client.submitBatch(campaign.id, prepared.sequence, signed)
    batches.push(submitted)
    opts.onBatch?.(submitted)
    if (batches.length >= prepared.totalBatches) break
  }
  return { campaignId: campaign.id, csvPath: opts.csvPath, batches }
}
