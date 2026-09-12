/**
 * `pnpm audit:verify-export <file> <signature-base64> <public-key-base64>`
 *
 * Verifies a saved export with the public key ALONE — no database, no Kleym.
 * This is the check a buyer's auditor runs. It also recomputes the row
 * hashes inside a JSON export, so a file edited after signing fails twice.
 */
import { readFileSync } from 'node:fs'
import { createPublicKey, verify } from 'node:crypto'
import { canonicalRowV1, rowHashFor } from '../src/lib/api/audit-chain'

const [file, signature, publicKey] = process.argv.slice(2)
if (!file || !signature || !publicKey) {
  console.error('usage: audit-verify-export <file> <signature-base64> <public-key-base64>')
  process.exit(2)
}
const bytes = readFileSync(file)
const key = createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' })
const signed = verify(null, bytes, key, Buffer.from(signature, 'base64'))
console.log(`signature: ${signed ? 'VALID' : 'INVALID'}`)

let chain = 'n/a (csv)'
if (file.endsWith('.json')) {
  const doc = JSON.parse(bytes.toString('utf8')) as { rows: Array<Record<string, unknown>> }
  let ok = true
  for (const r of doc.rows) {
    const recomputed = rowHashFor(String(r.prevHash ?? ''), canonicalRowV1({
      id: String(r.id), seq: BigInt(String(r.seq)), createdAt: new Date(String(r.createdAt)),
      userId: (r.userId as string | null) ?? null, organizationId: (r.organizationId as string | null) ?? null,
      action: String(r.action), entityType: (r.entityType as string | null) ?? null, entityId: (r.entityId as string | null) ?? null,
      metadata: r.metadata ?? null, ip: (r.ip as string | null) ?? null,
    }))
    if (recomputed !== r.rowHash) { ok = false; console.log(`row seq ${r.seq}: hash does not recompute`); break }
  }
  chain = ok ? 'VALID' : 'INVALID'
}
console.log(`row hashes: ${chain}`)
process.exit(signed && chain !== 'INVALID' ? 0 : 1)
