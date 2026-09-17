/**
 * Receive-as (#74), the sender's side: the list of assets a recipient may
 * convert into, as typed in the wizard. Client-safe (no Horizon, no Prisma);
 * the server re-validates every entry through `receiveAsAssetSchema`.
 */
import { StrKey } from '@stellar/stellar-sdk'

export interface ReceiveAsEntry {
  assetCode: string
  assetIssuer?: string
}

export type ReceiveAsParse =
  | { ok: true; assets: ReceiveAsEntry[] }
  | { ok: false; line: number; reason: 'format' | 'issuer' | 'seed' | 'same' | 'duplicate' | 'too-many' }

const CODE = /^[A-Za-z0-9]{1,12}$/
export const MAX_RECEIVE_AS = 5

/**
 * One asset per line: `XLM`, or `CODE:GISSUER…`. Refuses a seed anywhere
 * (never accepted as text), the campaign's own asset (that is "no conversion",
 * not an option), duplicates, and more than five.
 */
export function parseReceiveAs(input: string, campaign: { assetCode: string; assetIssuer: string }): ReceiveAsParse {
  const lines = input.split(/\r?\n|,/).map((l) => l.trim()).filter((l) => l.length > 0)
  const assets: ReceiveAsEntry[] = []
  for (const [index, line] of lines.entries()) {
    const at = index + 1
    if (StrKey.isValidEd25519SecretSeed(line) || line.split(':').some((part) => StrKey.isValidEd25519SecretSeed(part))) {
      return { ok: false, line: at, reason: 'seed' }
    }
    const [code, issuer, ...rest] = line.split(':')
    if (!code || rest.length > 0 || !CODE.test(code)) return { ok: false, line: at, reason: 'format' }
    const native = code.toUpperCase() === 'XLM' && !issuer
    if (!native && (!issuer || !StrKey.isValidEd25519PublicKey(issuer))) return { ok: false, line: at, reason: 'issuer' }
    const entry: ReceiveAsEntry = native ? { assetCode: 'XLM' } : { assetCode: code, assetIssuer: issuer }
    if (entry.assetCode === campaign.assetCode && (entry.assetIssuer ?? '') === campaign.assetIssuer) {
      return { ok: false, line: at, reason: 'same' }
    }
    if (assets.some((a) => a.assetCode === entry.assetCode && (a.assetIssuer ?? '') === (entry.assetIssuer ?? ''))) {
      return { ok: false, line: at, reason: 'duplicate' }
    }
    assets.push(entry)
  }
  if (assets.length > MAX_RECEIVE_AS) return { ok: false, line: MAX_RECEIVE_AS + 1, reason: 'too-many' }
  return { ok: true, assets }
}

export function receiveAsErrorMessage(parsed: Exclude<ReceiveAsParse, { ok: true }>): string {
  switch (parsed.reason) {
    case 'seed':
      return `Line ${parsed.line} contains a secret key. Kleym never accepts one — remove it and treat that key as compromised.`
    case 'format':
      return `Line ${parsed.line}: write XLM, or an asset code and its issuer as CODE:G… .`
    case 'issuer':
      return `Line ${parsed.line}: the issuer must be a Stellar public key (G…).`
    case 'same':
      return `Line ${parsed.line} is the asset this campaign sends. Recipients get that without converting.`
    case 'duplicate':
      return `Line ${parsed.line} repeats an asset already listed.`
    case 'too-many':
      return `At most ${MAX_RECEIVE_AS} assets.`
  }
}
