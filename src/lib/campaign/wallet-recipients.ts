/** Public recipient CSV only. Never accepts or uploads a secrets export. */
import { scanForMnemonic } from '@/lib/validation/mnemonic'
import { StrKey } from '@stellar/stellar-sdk'
import { isStellarAmount } from '@/lib/stellar/amount'
import type { Attestation } from './keygen'

export const WALLET_CSV_HEADER = 'label,public_key,secret,claim_url,reference,category,note,amount,claim_code,Wallet Address'
const cell = (value: string) => `"${value.replace(/"/g, '""')}"`

export function walletCsvTemplate(count = 10): string {
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('Choose between 1 and 10,000 template rows.')
  return [WALLET_CSV_HEADER, ...Array.from({ length: count }, () => Array(10).fill('').join(',')), ''].join('\r\n')
}

/** RFC 4180: quoted commas, quotes and newlines; malformed quoting is refused. */
export function recipientCsvRecords(input: string): string[][] {
  const out: string[][] = []
  let row: string[] = [], value = '', quoted = false, closed = false
  const field = () => { row.push(value.trim()); value = ''; closed = false }
  const end = () => { field(); out.push(row); row = [] }
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { value += '"'; i++ }
      else if (ch === '"') { quoted = false; closed = true }
      else value += ch
    } else if (ch === ',') field()
    else if (ch === '\n') end()
    else if (ch === '"' && !value && !closed) quoted = true
    else if (ch === '"' || (closed && ch.trim())) throw new Error('Malformed CSV quoting. Save the template as a CSV file and try again.')
    else if (!closed) value += ch
  }
  if (quoted) throw new Error('The CSV contains an unclosed quote.')
  if (value || row.length || closed) end()
  return out
}

export interface WalletRecipients {
  labels: string[]
  wallets: string[]
  amounts: (string | null)[]
  attestations: (Attestation | null)[]
}

export function parseWalletRecipients(input: string, allowed: number): WalletRecipients {
  if (new TextEncoder().encode(input).length > 2_000_000) throw new Error('The CSV must be smaller than 2 MB.')
  if (scanForMnemonic(input) !== 'clean') throw new Error('The CSV contains recovery words or too much sensitive-looking text. Upload only public recipient details.')
  const rows = recipientCsvRecords(input)
  const header = rows.shift()?.map((s) => s.toLowerCase().replace(/_/g, ' ')) ?? []
  if (new Set(header).size !== header.length || !header.includes('wallet address')) throw new Error('Use the CSV template with one Wallet Address column.')
  const at = (row: string[], name: string) => row[header.indexOf(name)] ?? ''
  const result: WalletRecipients = { labels: [], wallets: [], amounts: [], attestations: [] }
  for (const [index, row] of rows.entries()) {
    if (!row.some(Boolean)) continue // Empty template rows are not recipients.
    const line = index + 2
    if (row.length !== header.length) throw new Error(`CSV row ${line} has the wrong number of columns.`)
    if (row.some((s) => /S[A-Z2-7]{55}/.test(s)) || ['public key', 'secret', 'claim url', 'claim code'].some((name) => at(row, name))) {
      throw new Error('Upload the public recipient template, not a secrets export. Leave public_key, secret, claim_url and claim_code empty.')
    }
    const wallet = at(row, 'wallet address')
    if (!StrKey.isValidEd25519PublicKey(wallet)) throw new Error(`CSV row ${line} needs a valid Stellar G-address in Wallet Address.`)
    const label = at(row, 'label')
    const reference = at(row, 'reference'), category = at(row, 'category'), note = at(row, 'note')
    if (label.length > 200 || reference.length > 120 || category.length > 60 || note.length > 500) throw new Error(`CSV row ${line} has a label or note over its length limit.`)
    const amount = at(row, 'amount')
    if (amount && !isStellarAmount(amount)) throw new Error(`CSV row ${line} needs a positive amount with at most 7 decimal places.`)
    result.wallets.push(wallet)
    result.labels.push(label)
    result.amounts.push(amount || null)
    result.attestations.push(reference || category || note ? { reference: reference || null, category: category || null, note: note || null } : null)
    if (result.wallets.length > allowed) throw new Error(`The CSV exceeds the ${allowed} recipient limit.`)
  }
  if (!result.wallets.length) throw new Error('Add at least one Wallet Address to the template before inserting it.')
  return result
}

/** Public snapshot: generated secrets and URLs are always blank. */
export function walletRecipientSnapshot(recipients: WalletRecipients): string {
  return [WALLET_CSV_HEADER, ...recipients.wallets.map((wallet, i) => [recipients.labels[i] ?? '', '', '', '',
    recipients.attestations[i]?.reference ?? '', recipients.attestations[i]?.category ?? '', recipients.attestations[i]?.note ?? '',
    recipients.amounts[i] ?? '', '', wallet].map(cell).join(',')), ''].join('\r\n')
}
