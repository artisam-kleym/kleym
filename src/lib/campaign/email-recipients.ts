/** Email assignments only. Private exported keys/URLs are never uploadable. */
import { z } from 'zod'
import { scanForMnemonic } from '@/lib/validation/mnemonic'
import { isStellarAmount } from '@/lib/stellar/amount'
import type { Attestation } from './keygen'
import { recipientCsvRecords } from './wallet-recipients'

export const EMAIL_CSV_HEADER = 'label,public_key,secret,claim_url,reference,category,note,amount,claim_code,Email Address'
export interface EmailRecipients { labels: string[]; emails: string[]; amounts: (string | null)[]; attestations: (Attestation | null)[] }
export const recipientEmail = z.email().max(254)

export function emailCsvTemplate(count = 10): string {
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('Choose between 1 and 10,000 template rows.')
  return [EMAIL_CSV_HEADER, ...Array.from({ length: count }, () => Array(10).fill('').join(',')), ''].join('\r\n')
}
export function parseEmailRecipients(input: string, allowed: number): EmailRecipients {
  if (new TextEncoder().encode(input).length > 2_000_000) throw new Error('The CSV must be smaller than 2 MB.')
  if (scanForMnemonic(input) !== 'clean') throw new Error('Upload only recipient details, never recovery words or secrets.')
  const rows = recipientCsvRecords(input)
  const header = rows.shift()?.map((value) => value.toLowerCase().replace(/_/g, ' ')) ?? []
  if (new Set(header).size !== header.length || !header.includes('email address')) throw new Error('Use the CSV template with one Email Address column.')
  const at = (row: string[], name: string) => row[header.indexOf(name)] ?? ''
  const result: EmailRecipients = { labels: [], emails: [], amounts: [], attestations: [] }
  for (const [index, row] of rows.entries()) {
    if (!row.some(Boolean)) continue
    const line = index + 2
    if (row.length !== header.length) throw new Error(`CSV row ${line} has the wrong number of columns.`)
    if (row.some((value) => /S[A-Z2-7]{55}/.test(value)) || ['public key', 'secret', 'claim url', 'claim code'].some((name) => at(row, name))) throw new Error('Upload the empty recipient template after adding emails, not a secrets export.')
    const email = at(row, 'email address').toLowerCase()
    if (!recipientEmail.safeParse(email).success) throw new Error(`CSV row ${line} needs a valid Email Address.`)
    const label = at(row, 'label'), reference = at(row, 'reference'), category = at(row, 'category'), note = at(row, 'note'), amount = at(row, 'amount')
    if (label.length > 200 || reference.length > 120 || category.length > 60 || note.length > 500) throw new Error(`CSV row ${line} has a label or note over its length limit.`)
    if (amount && !isStellarAmount(amount)) throw new Error(`CSV row ${line} needs a positive amount with at most 7 decimal places.`)
    result.emails.push(email); result.labels.push(label); result.amounts.push(amount || null)
    result.attestations.push(reference || category || note ? { reference: reference || null, category: category || null, note: note || null } : null)
    if (result.emails.length > allowed) throw new Error(`The CSV exceeds the ${allowed} recipient limit.`)
  }
  if (!result.emails.length) throw new Error('Add at least one Email Address before inserting the CSV.')
  return result
}
export function emailRecipientSnapshot(rows: EmailRecipients): string {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`
  return [EMAIL_CSV_HEADER, ...rows.emails.map((email, i) => [rows.labels[i] ?? '', '', '', '', rows.attestations[i]?.reference ?? '', rows.attestations[i]?.category ?? '', rows.attestations[i]?.note ?? '', rows.amounts[i] ?? '', '', email].map(cell).join(',')), ''].join('\r\n')
}
