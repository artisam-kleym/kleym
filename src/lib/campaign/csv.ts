/**
 * The CSV that carries every secret this campaign will ever have. SPEC.md §5.3.
 *
 * Built in the browser, from a Blob, and handed to the user by an object URL.
 * It never round-trips through a server: a "download your CSV" endpoint would
 * mean the server had the seeds, which is the whole thing this product does
 * not do.
 */
import { StrKey } from '@stellar/stellar-sdk'
import type { Attestation, EphemeralKey } from './keygen'

/**
 * Attestation columns (#52): the sender's own reference data per recipient,
 * imported under these header names and exported under the same ones so a
 * file round-trips. Each has a length cap matching `registerLinksSchema`.
 */
export const ATTESTATION_COLUMNS = { reference: 120, category: 60, note: 500 } as const
export type AttestationColumn = keyof typeof ATTESTATION_COLUMNS

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
 *
 * `#s=<seed>` — named, so a second field can be added later without changing
 * how the first is read, and RAW rather than base64url. SPEC.md §3.6 first
 * specified base64url; encoding defeats Kleym's own leak detection, since
 * `scanForSecretSeed`, the env leak scan and the CI guard all match
 * `S[A-Z2-7]{55}` and none of them sees the encoded form. See
 * lib/claim/fragment.ts, which reads it.
 */
export function claimUrl(appUrl: string, secret: string): string {
  return `${appUrl.replace(/\/$/, '')}/claim#s=${secret}`
}

export function buildCsv(rows: CsvRow[]): string {
  // Attestation columns come LAST so anything reading the first four by position still works.
  const header = ['label', 'public_key', 'secret', 'claim_url', 'reference', 'category', 'note'].join(',')
  const lines = rows.map(({ key, url }) =>
    [
      quote(key.label ?? ''), quote(key.publicKey), quote(key.secret), quote(url),
      quote(key.attestation?.reference ?? ''), quote(key.attestation?.category ?? ''), quote(key.attestation?.note ?? ''),
    ].join(','),
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
  | { ok: true; labels: string[]; attestations?: (Attestation | null)[] }
  | { ok: false; reason: 'address'; line: number }
  | { ok: false; reason: 'seed'; line: number }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'too-many'; found: number; allowed: number }
  | { ok: false; reason: 'too-long'; line: number; column: AttestationColumn; allowed: number }

/** One RFC 4180 line into cells. Quotes are stripped, doubled quotes unescaped. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      cells.push(cell)
      cell = ''
    } else cell += ch
  }
  cells.push(cell)
  return cells.map((c) => c.trim())
}

/**
 * Parses a pasted or uploaded label list, and REFUSES addresses and seeds.
 *
 * Labels are the sender's own notes — a handle, an email, a row number. An
 * address here means the sender has misunderstood what the field is for and is
 * about to publish recipient addresses into a file they will share; a seed
 * means something far worse is happening. Both are refused loudly rather than
 * silently accepted as text (SPEC.md §5.3).
 *
 * Only the FIRST column is read, unless a header row NAMES the attestation
 * columns (#52) — `label,reference,category,note`, in any order, with any
 * other column ignored. A pasted spreadsheet row often carries an address in
 * a later column, and reading it would be reading the thing this refuses; a
 * column is read only when the sender said what it is, and every cell read
 * gets the same seed and address check as a label.
 */
export function parseLabels(input: string, allowed: number): LabelParseResult {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) return { ok: false, reason: 'empty' }

  // A header row is the ordinary case for an uploaded file.
  const header = splitCsvLine(lines[0]!).map((c) => c.toLowerCase())
  const hasHeader = header[0] === 'label'
  const columns: Partial<Record<AttestationColumn, number>> = {}
  if (hasHeader) {
    for (const name of Object.keys(ATTESTATION_COLUMNS) as AttestationColumn[]) {
      const at = header.indexOf(name)
      if (at > 0) columns[name] = at
    }
  }
  const withAttestation = Object.keys(columns).length > 0

  const labels: string[] = []
  const attestations: (Attestation | null)[] = []

  for (const [index, line] of lines.entries()) {
    if (hasHeader && index === 0) continue
    const cells = splitCsvLine(line)
    const first = cells[0] ?? ''

    const refused = refuseKeyMaterial(first, index + 1)
    if (refused) return refused
    labels.push(first)

    if (!withAttestation) continue
    const fields: Attestation = { reference: null, category: null, note: null }
    for (const [name, at] of Object.entries(columns) as [AttestationColumn, number][]) {
      const value = cells[at] ?? ''
      const bad = refuseKeyMaterial(value, index + 1)
      if (bad) return bad
      if (value.length > ATTESTATION_COLUMNS[name]) {
        return { ok: false, reason: 'too-long', line: index + 1, column: name, allowed: ATTESTATION_COLUMNS[name] }
      }
      fields[name] = value || null
    }
    attestations.push(fields.reference || fields.category || fields.note ? fields : null)
  }

  if (labels.length > allowed) {
    return { ok: false, reason: 'too-many', found: labels.length, allowed }
  }

  return withAttestation ? { ok: true, labels, attestations } : { ok: true, labels }
}

function refuseKeyMaterial(value: string, line: number): LabelParseResult | null {
  if (StrKey.isValidEd25519SecretSeed(value)) return { ok: false, reason: 'seed', line }
  if (StrKey.isValidEd25519PublicKey(value) || StrKey.isValidMed25519PublicKey(value)) {
    return { ok: false, reason: 'address', line }
  }
  return null
}
