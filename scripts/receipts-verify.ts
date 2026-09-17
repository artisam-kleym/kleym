/**
 * `pnpm receipts:verify <file> [signature-base64] [public-key-base64]`
 *
 * Verifies a saved claim receipt (#81), or a receipts bundle, with the public
 * key ALONE — no database, no Kleym. A single receipt file is the exact
 * signed bytes: pass the signature and key from the response headers. A JSON
 * bundle carries every receipt's signature and key inside it; each is
 * checked, and the bundle's own signature too when the headers are given.
 */
import { readFileSync } from 'node:fs'
import { createPublicKey, verify } from 'node:crypto'

const [file, signature, publicKey] = process.argv.slice(2)
if (!file) {
  console.error('usage: receipts-verify <file> [signature-base64] [public-key-base64]')
  process.exit(2)
}
const bytes = readFileSync(file)

function check(data: Buffer, sig: string, key: string): boolean {
  try {
    return verify(null, data, createPublicKey({ key: Buffer.from(key, 'base64'), format: 'der', type: 'spki' }), Buffer.from(sig, 'base64'))
  } catch {
    return false
  }
}

let ok = true
if (signature && publicKey) {
  const whole = check(bytes, signature, publicKey)
  console.log(`file signature: ${whole ? 'VALID' : 'INVALID'}`)
  ok &&= whole
}

let doc: { format?: string; receipts?: Array<{ receiptId: string; canonical: string; signature: string; publicKey: string }> } | null = null
try {
  doc = JSON.parse(bytes.toString('utf8'))
} catch {
  doc = null
}
if (doc?.format === 'kleym-claim-receipts' && Array.isArray(doc.receipts)) {
  let bad = 0
  for (const r of doc.receipts) {
    if (!check(Buffer.from(r.canonical), r.signature, r.publicKey)) {
      bad += 1
      console.log(`receipt ${r.receiptId}: INVALID`)
    }
  }
  console.log(`receipts: ${doc.receipts.length - bad} of ${doc.receipts.length} VALID`)
  ok &&= bad === 0
} else if (doc?.format === 'kleym-claim-receipt') {
  if (!signature || !publicKey) console.log('a single receipt needs the signature and public key from the response headers')
} else if (!signature) {
  console.log('not a receipts bundle; pass the signature and public key to verify the file itself')
  ok = false
}
process.exit(ok ? 0 : 1)
