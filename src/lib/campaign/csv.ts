/**
 * The CSV that carries every secret this campaign will ever have. SPEC.md §5.3.
 *
 * Built in the browser, from a Blob, and handed to the user by an object URL.
 * It never round-trips through a server: a "download your CSV" endpoint would
 * mean the server had the seeds, which is the whole thing this product does
 * not do.
 */
import { StrKey } from '@stellar/stellar-sdk'
import type { EphemeralKey } from './keygen'

export interface CsvRow {
  key: EphemeralKey
  url: string
}

/**
 * RFC 4180 quoting.
 *
 * Labels are user-supplied, so a comma, quote or newline in one would
 * otherwise shift every later column — and the column that shifts is the seed.
 * A CSV the sender cannot parse is a campaign whose funds are stranded.
 */
function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

/**
 * The claim URL, with the secret in the FRAGMENT.
 *
 * A fragment is not sent to the server, is not written to an access log, and
 * is not carried in a `Referer` (SPEC.md §3.6). A query string is all three.
 */
export function claimUrl(appUrl: string, secret: string): string {
  return `${appUrl.replace(/\/$/, '')}/claim#${secret}`
}

export function buildCsv(rows: CsvRow[]): string {
  const header = ['label', 'public_key', 'secret', 'claim_url'].join(',')
  const lines = rows.map(({ key, url }) =>
    [quote(key.label ?? ''), quote(key.publicKey), quote(key.secret), quote(url)].join(','),
  )
  // Trailing newline: without it, some tools drop the final row.
  return `${[header, ...lines].join('\n')}\n`
}

/** A filename that says what the file is and which campaign it belongs to. */
export function csvFilename(campaignName: string): string {
  const slug = campaignName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `kleym-${slug || 'campaign'}-secrets.csv`
}

export type LabelParseResult =
  | { ok: true; labels: string[] }
  | { ok: false; reason: 'address'; line: number }
  | { ok: false; reason: 'seed'; line: number }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'too-many'; found: number; allowed: number }

/**
 * Parses a pasted or uploaded label list, and REFUSES addresses and seeds.
 *
 * Labels are the sender's own notes — a handle, an email, a row number. An
 * address here means the sender has misunderstood what the field is for and is
 * about to publish recipient addresses into a file they will share; a seed
 * means something far worse is happening. Both are refused loudly rather than
 * silently accepted as text (SPEC.md §5.3).
 *
 * Only the FIRST column is read. A pasted spreadsheet row often carries an
 * address in a later column, and reading it would be reading the thing this
 * refuses.
 */
export function parseLabels(input: string, allowed: number): LabelParseResult {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) return { ok: false, reason: 'empty' }

  const labels: string[] = []

  for (const [index, line] of lines.entries()) {
    const first = (line.split(',')[0] ?? '').trim().replace(/^"|"$/g, '')

    if (StrKey.isValidEd25519SecretSeed(first)) {
      return { ok: false, reason: 'seed', line: index + 1 }
    }
    if (StrKey.isValidEd25519PublicKey(first) || StrKey.isValidMed25519PublicKey(first)) {
      return { ok: false, reason: 'address', line: index + 1 }
    }
    labels.push(first)
  }

  // A header row is the ordinary case for an uploaded file.
  if (labels[0]?.toLowerCase() === 'label') labels.shift()

  if (labels.length > allowed) {
    return { ok: false, reason: 'too-many', found: labels.length, allowed }
  }

  return { ok: true, labels }
}
