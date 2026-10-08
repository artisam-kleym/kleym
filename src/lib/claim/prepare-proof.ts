/** Public, domain-separated bytes. The holder signs locally; no secret is sent. */
export interface PrepareProofInput {
  ephemeralPublicKey: string
  recipientPublicKey?: string
  receiveAs?: { assetCode: string; assetIssuer: string | null; destMin?: string }
  memo?: { type: string; value: string }
}

export function prepareProofMessage(origin: string, network: 'testnet' | 'public', phase: 'materialise' | 'claim',
  expires: number, input: PrepareProofInput): string {
  return JSON.stringify({ domain: 'kleym:claim-prepare:v1', origin, network, phase, expires,
    ephemeralPublicKey: input.ephemeralPublicKey, recipientPublicKey: input.recipientPublicKey ?? null,
    receiveAs: input.receiveAs ? { assetCode: input.receiveAs.assetCode, assetIssuer: input.receiveAs.assetIssuer,
      destMin: input.receiveAs.destMin ?? null } : null,
    memo: input.memo ? { type: input.memo.type, value: input.memo.value } : null })
}
