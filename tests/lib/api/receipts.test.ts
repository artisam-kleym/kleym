import { describe, expect, it } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import Decimal from 'decimal.js'
import { RECEIPT_COLUMNS, buildReceipt, buildReceiptBundle, verifyReceipt, type ReceiptInput } from '@/lib/api/receipts'
import { receiptEmail } from '@/lib/email/templates'
import { verifyBytes } from '@/lib/api/audit-chain'
import { containsSecretSeed } from '@/lib/validation/stellar'

/*
 * #81. A receipt is evidence: it verifies with the public key alone, any
 * change breaks it, and nothing in it comes from the link. The database
 * side (issued once per claim, organisation-scoped) is checked for WIRING by
 * scripts/verify-receipts.ts against a database.
 */
const RECIPIENT = Keypair.random().publicKey()
const ISSUER = Keypair.random().publicKey()
const SEED = Keypair.random().secret()

const input = (over: Partial<ReceiptInput['claim']> = {}): ReceiptInput => ({
  receiptId: 'rcpt_l1',
  organization: { id: 'o1', name: 'Acme Treasury' },
  campaign: { id: 'c1', name: 'Q3 bonus', network: 'testnet', assetCode: 'USDC', assetIssuer: ISSUER, claimPolicy: 'email' },
  link: { id: 'l1', label: 'alice', reference: 'PAY-1', category: 'payroll', note: null, amount: new Decimal('0.0000001') },
  claim: { recipient: RECIPIENT, claimedAt: new Date('2026-09-17T12:00:00.000Z'), transactionHash: 'ab'.repeat(32), memoType: 'id', memo: '12345', emailed: true, ...over },
})

describe('buildReceipt', () => {
  it('verifies with the public key alone, against its own canonical bytes', () => {
    const r = buildReceipt(input())
    expect(verifyReceipt(r.canonical, r.signature, r.publicKey)).toBe(true)
    // The generic verifier the audit and regulator exports use reads it too: one story.
    expect(verifyBytes(Buffer.from(r.canonical), r.signature, r.publicKey)).toBe(true)
  })

  it('is deterministic: the same inputs give the same bytes, so a stored receipt re-checks forever', () => {
    expect(buildReceipt(input()).canonical).toBe(buildReceipt(input()).canonical)
  })

  it('fails to verify once any field is altered', () => {
    const r = buildReceipt(input())
    const doc = JSON.parse(r.canonical) as Record<string, Record<string, unknown>>
    for (const [section, field, value] of [
      ['claim', 'amount', '1.0000000'],
      ['claim', 'recipient', Keypair.random().publicKey()],
      ['claim', 'claimedAt', '2026-09-18T12:00:00.000Z'],
      ['claim', 'transactionHash', 'cd'.repeat(32)],
      ['claim', 'memo', '12346'],
      ['campaign', 'name', 'Q4 bonus'],
    ] as const) {
      const altered = JSON.parse(r.canonical) as Record<string, Record<string, unknown>>
      altered[section]![field] = value
      expect(verifyReceipt(JSON.stringify(altered), r.signature, r.publicKey), `${section}.${field}`).toBe(false)
    }
    expect(doc.claim!.amount).toBe('0.0000001')
    expect(verifyReceipt(r.canonical, r.signature.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')), r.publicKey)).toBe(false)
  })

  it('records the memo where one applied, the channel and the policy', () => {
    const c = buildReceipt(input()).contents.claim
    expect(c).toMatchObject({ memoType: 'id', memo: '12345', deliveryChannel: 'email', claimPolicy: 'email' })
    expect(buildReceipt(input({ memoType: null, memo: null, emailed: false })).contents.claim).toMatchObject({ memoType: null, memo: null, deliveryChannel: 'sender' })
  })

  it('never renders an amount as an exponent (AGENT.md §4.1)', () => {
    expect(buildReceipt(input()).contents.claim.amount).toBe('0.0000001')
    expect(buildReceipt(input()).canonical).not.toMatch(/e-\d/i)
  })

  it('carries no seed, no claim URL and nothing fragment-shaped — in the receipt or the email (verify-email style)', () => {
    const r = buildReceipt(input())
    const mail = receiptEmail({
      senderName: 'Acme', amount: '0.0000001', assetCode: 'USDC', recipient: RECIPIENT, claimedAt: new Date(), transactionHash: 'ab'.repeat(32),
      receiptId: r.receiptId, canonical: r.canonical, signature: r.signature, publicKey: r.publicKey,
    })
    for (const body of [r.canonical, mail.text, mail.html, mail.subject]) {
      expect(body).not.toMatch(/\/claim/)
      expect(body).not.toMatch(/#s=/)
      expect(body).not.toMatch(/S[A-Z2-7]{55}/)
      expect(body).not.toContain(SEED)
      expect(containsSecretSeed(body)).toBe(false)
    }
    expect(mail.text).not.toMatch(/https?:\/\//)
    // What it DOES carry is what the ledger shows anyone.
    expect(mail.text).toContain(RECIPIENT)
    expect(mail.text).toContain('ab'.repeat(32))
  })
})

describe('buildReceiptBundle', () => {
  const receipts = [buildReceipt(input()), buildReceipt({ ...input(), receiptId: 'rcpt_l2', link: { ...input().link, id: 'l2', amount: '250' } })]
  const query = { organizationId: 'o1', organizationName: 'Acme Treasury', campaignId: 'c1' }

  it('signs the bundle as a whole while every receipt inside still verifies alone', () => {
    const out = buildReceiptBundle(receipts, query, 'json', new Date('2026-09-17T13:00:00Z'))
    expect(verifyBytes(out.body, out.signature, out.publicKey)).toBe(true)
    const doc = JSON.parse(out.body.toString('utf8')) as { format: string; count: number; receipts: { canonical: string; signature: string; publicKey: string }[] }
    expect(doc.format).toBe('kleym-claim-receipts')
    expect(doc.count).toBe(2)
    for (const r of doc.receipts) expect(verifyReceipt(r.canonical, r.signature, r.publicKey)).toBe(true)
  })

  it('writes one CSV row per receipt with the canonical bytes as the last column, and no exponent', () => {
    const out = buildReceiptBundle(receipts, query, 'csv', new Date('2026-09-17T13:00:00Z'))
    expect(verifyBytes(out.body, out.signature, out.publicKey)).toBe(true)
    const lines = out.body.toString('utf8').trimEnd().split('\n')
    expect(lines[0]).toBe(RECEIPT_COLUMNS.join(','))
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain(',0.0000001,')
    expect(out.body.toString('utf8')).not.toMatch(/e-\d/i)
    expect(RECEIPT_COLUMNS.at(-1)).toBe('canonical')
  })
})
