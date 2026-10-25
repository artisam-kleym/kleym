'use client'

/**
 * The CSV hard gate. SPEC.md §5.3 step 3, §10.11.
 *
 * Continue is unreachable until the download has FIRED — not until a button
 * was rendered, not until the user clicked something. The gate is a piece of
 * state that only `triggerDownload` can set, so there is no path to step 4
 * that does not pass through the browser actually being handed the file.
 *
 * Kept out of the component so the rule is testable on its own and cannot be
 * loosened by a JSX edit.
 */
import { buildCsv, claimUrl, csvFilename, type CsvRow } from '@/lib/campaign/csv'
import type { EphemeralKey } from '@/lib/campaign/keygen'

export interface DownloadResult {
  /** True only once the browser has been handed the file. */
  fired: boolean
  filename: string
}

/**
 * Writes the CSV to the user's disk via a Blob and an object URL.
 *
 * A Blob, not a server round trip: an endpoint that returned this file would
 * mean the server held the seeds (AGENT.md §1). The object URL is revoked
 * immediately — it is a same-origin handle to a document full of secrets, and
 * leaving it live leaves that document reachable from the tab.
 */
export function triggerDownload(
  keys: EphemeralKey[],
  campaignName: string,
  appUrl: string,
  withCodes = false,
): DownloadResult {
  if (keys.length === 0) throw new Error('refusing to download an empty secrets file')

  const rows: CsvRow[] = keys.map((key) => ({ key, url: claimUrl(appUrl, key.secret) }))
  const filename = csvFilename(campaignName)

  const blob = new Blob([buildCsv(rows, { requireCodes: withCodes })], { type: 'text/csv;charset=utf-8' })
  const href = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  URL.revokeObjectURL(href)

  return { fired: true, filename }
}
