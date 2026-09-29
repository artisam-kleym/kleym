/**
 * The API client. Public keys only, by construction and by check.
 *
 * `registerLinks` accepts a `PublicLinks` — the branded value only
 * `publicHalves` produces. And every request body, whatever method built
 * it, is scanned for a secret seed immediately before the fetch; one found
 * throws `SeedInRequestError` and nothing is sent. Belt and braces: the type
 * prevents the mistake, the scan proves it did not happen.
 */
import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk'
import { containsSecretSeed, type PublicLinks } from './keys.js'

export class SeedInRequestError extends Error {
  constructor() {
    super('refusing to send a request whose body contains a secret seed')
    this.name = 'SeedInRequestError'
  }
}

export class KleymApiError extends Error {
  constructor(public readonly status: number, public readonly problem: Record<string, unknown>) {
    super(`${status}: ${String(problem.detail ?? problem.title ?? 'request failed')}`)
    this.name = 'KleymApiError'
  }
}

export interface ClientOptions {
  baseUrl: string
  apiKey: string
  fetch?: typeof fetch
}

export interface CampaignTerms {
  name: string
  network: 'testnet' | 'public'
  senderPublicKey: string
  assetCode: string
  assetIssuer?: string
  amountPerLink: string
  linkCount: number
  expiresAt: string
}

/** Public deployment identity; no operational keys or provider credentials. */
export interface StellarMetadata {
  network: 'testnet' | 'public'
  networkPassphrase: string
  networkLabel: string
  defaultAsset: { assetCode: string; assetIssuer: string }
  nativeAsset: { assetCode: string; assetIssuer: null }
  isRealMoney: boolean
  valueNotice: string
}

export interface Campaign {
  id: string
  name: string
  status: string
  network: string
  assetCode: string
  assetIssuer: string | null
  amountPerLink: string
  linkCount: number
  expiresAt: string
  createdAt: string
}

export interface PreparedBatch {
  sequence: number
  totalBatches: number
  linkCount: number
  xdr: string
  networkPassphrase: string
  reserve: string
  reservePerLink: string
  baseReserve: string
  expiresAt: string
}

export interface SubmittedBatch {
  sequence: number
  status: string
  transactionHash: string
  replay: boolean
}

export class KleymClient {
  private readonly base: string
  private readonly fetchImpl: typeof fetch

  constructor(private readonly opts: ClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, '')
    this.fetchImpl = opts.fetch ?? fetch
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const text = body === undefined ? undefined : JSON.stringify(body)
    if (text !== undefined && containsSecretSeed(text)) throw new SeedInRequestError()
    if (containsSecretSeed(path)) throw new SeedInRequestError()
    const response = await this.fetchImpl(`${this.base}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.opts.apiKey}`, ...(text !== undefined ? { 'content-type': 'application/json' } : {}), accept: 'application/json' },
      body: text,
    })
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) throw new KleymApiError(response.status, payload)
    return payload as T
  }

  listCampaigns(query: { status?: string; page?: number; perPage?: number } = {}): Promise<{ campaigns: Campaign[]; total: number }> {
    const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
    return this.call('GET', `/api/v1/campaigns${q.size ? `?${q}` : ''}`)
  }

  getStellarMetadata(): Promise<StellarMetadata> {
    return this.call('GET', '/api/stellar/network')
  }

  getCampaign(id: string): Promise<Campaign & { reserveEstimate: string | null; csvExportedAt: string | null }> {
    return this.call('GET', `/api/v1/campaigns/${id}`)
  }

  createCampaign(terms: CampaignTerms): Promise<Campaign> {
    return this.call('POST', '/api/v1/campaigns', terms)
  }

  /** Public keys only — the type admits nothing else, and the body is scanned regardless. */
  registerLinks(campaignId: string, links: PublicLinks): Promise<{ registered: number; total: number }> {
    return this.call('POST', `/api/v1/campaigns/${campaignId}/links`, links)
  }

  markExported(campaignId: string): Promise<{ csvExportedAt: string }> {
    return this.call('POST', `/api/v1/campaigns/${campaignId}/export`, {})
  }

  prepareBatch(campaignId: string, sequence?: number): Promise<PreparedBatch> {
    return this.call('POST', `/api/v1/campaigns/${campaignId}/batches/prepare`, sequence ? { sequence } : {})
  }

  submitBatch(campaignId: string, sequence: number, signedXdr: string): Promise<SubmittedBatch> {
    return this.call('POST', `/api/v1/campaigns/${campaignId}/batches/submit`, { sequence, signedXdr })
  }
}

/**
 * Signs a prepared envelope with the SENDER's key, locally. The sender's
 * seed comes from the caller's environment and is used here and nowhere
 * else; the signed XDR carries a signature, not the seed.
 */
export function signBatchXdr(xdr: string, networkPassphrase: string, senderSecret: string): string {
  const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase)
  tx.sign(Keypair.fromSecret(senderSecret))
  return tx.toXDR()
}

export { Networks }
