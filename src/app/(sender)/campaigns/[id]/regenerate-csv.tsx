'use client'

/**
 * Regenerate a campaign's secrets file from the recovery phrase (#77).
 *
 * Entirely in the browser: the phrase is typed into this component's state,
 * the keys are derived here, checked against the PUBLIC keys the server holds,
 * and written to disk by the same Blob path the wizard uses. Nothing leaves
 * the tab but the phrase's fingerprint comparison — and that happens here too,
 * against a value the page already had. Kleym cannot do this for the sender;
 * it does not have the phrase, and that is the point (AGENT.md §1).
 */
import { useState } from 'react'
import { Button, WarningPanel } from '@/components/ui'
import { isValidPhrase, phraseFingerprint } from '@/lib/campaign/derive'
import { deriveEphemeralKeys, type Attestation } from '@/lib/campaign/keygen'
import { triggerDownload } from '../new/download-gate'

interface LinkRow {
  ephemeralPublicKey: string
  recipientPublicKey?: string | null
  label: string | null
  reference?: string | null
  category?: string | null
  note?: string | null
  /** What this link pays (#73), fixed-point. */
  amount?: string | null
}

type Phase = 'closed' | 'open' | 'working' | 'done'

export function RegenerateCsv({
  campaignId,
  campaignName,
  linkCount,
  derivationIndex,
  keyFingerprint,
  withCodes,
  appUrl,
}: {
  campaignId: string
  campaignName: string
  linkCount: number
  derivationIndex: number
  keyFingerprint: string | null
  /** CODE policy (#79): the codes are derived beside the keys, so the regenerated file carries them. */
  withCodes: boolean
  appUrl: string
}) {
  const [phase, setPhase] = useState<Phase>('closed')
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)

  async function regenerate() {
    setError(null)
    if (!isValidPhrase(phrase)) return setError('That is not a valid recovery phrase.')
    if (keyFingerprint && phraseFingerprint(phrase) !== keyFingerprint) {
      return setError('That phrase is not the one this campaign was made from. Nothing has been generated.')
    }
    setPhase('working')
    try {
      const rows = await loadAllLinks(campaignId)
      if (rows.length === 0) throw new Error('This campaign has no registered links yet.')
      const keys = deriveEphemeralKeys(
        phrase,
        derivationIndex,
        Math.max(rows.length, linkCount),
        rows.map((row) => row.label ?? ''),
        rows.map((row): Attestation | null =>
          row.reference || row.category || row.note ? { reference: row.reference ?? null, category: row.category ?? null, note: row.note ?? null } : null,
        ),
        rows.map((row) => row.amount ?? null),
        { withCodes, ...(rows.some((row) => row.recipientPublicKey) ? { recipientPublicKeys: rows.map((row) => row.recipientPublicKey ?? '') } : {}) },
      ).slice(0, rows.length)

      /*
       * Every derived public key must match the row at the same position.
       * A single mismatch means this is not the campaign's phrase or index,
       * and a file of the wrong keys is worse than no file: the sender would
       * believe they had the secrets.
       */
      const mismatched = keys.filter((key, index) => key.publicKey !== rows[index]!.ephemeralPublicKey).length
      if (mismatched > 0) {
        throw new Error(`${mismatched} of ${rows.length} derived keys do not match this campaign’s links. Nothing was written.`)
      }

      const result = triggerDownload(keys, campaignName, appUrl, withCodes)
      setFilename(result.filename)
      setPhrase('')
      setPhase('done')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The file could not be regenerated.')
      setPhase('open')
    }
  }

  if (phase === 'closed') {
    return (
      <section className="mt-lg rounded-lg border border-outline-variant/50 bg-surface-container p-lg">
        <h2 className="text-headline-md text-on-surface">Secrets file</h2>
        <p className="mt-sm max-w-2xl text-body-md text-on-surface-variant">
          This campaign’s keys were derived from your recovery phrase, so the secrets file can be regenerated here,
          in your browser, at any time. Kleym holds no copy of the phrase or the keys.
        </p>
        <div className="mt-md">
          <Button variant="secondary" onClick={() => setPhase('open')} data-testid="regenerate-open">
            Regenerate from recovery phrase
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="mt-lg rounded-lg border border-outline-variant/50 bg-surface-container p-lg">
      <h2 className="text-headline-md text-on-surface">Regenerate the secrets file</h2>
      {phase === 'done' ? (
        <p className="mt-sm text-body-md text-on-surface-variant" data-testid="regenerate-done">
          Written as <span className="font-mono text-on-surface">{filename}</span>. Every public key matched this
          campaign’s links.
        </p>
      ) : (
        <>
          <div className="mt-md">
            <WarningPanel heading="Type the phrase only on a device you trust">
              The phrase is derived into keys here and never sent anywhere. Anyone reading your screen or your
              clipboard is reading every campaign made from it.
            </WarningPanel>
          </div>
          <label className="mt-md flex flex-col gap-xs">
            <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Recovery phrase</span>
            <textarea
              rows={3}
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              data-testid="regenerate-phrase"
              className="rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface"
            />
          </label>
          {error && (
            <p role="alert" className="mt-sm font-mono text-label-sm text-error">
              {error}
            </p>
          )}
          <div className="mt-md flex flex-wrap gap-sm">
            <Button onClick={() => void regenerate()} disabled={phase === 'working' || phrase.trim().length === 0} data-testid="regenerate-run">
              {phase === 'working' ? 'Deriving…' : 'Regenerate and download'}
            </Button>
            <Button variant="tertiary" onClick={() => { setPhrase(''); setError(null); setPhase('closed') }}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

/** Every link, in LINK_ORDER, one page at a time — the same order the keys were registered in. */
async function loadAllLinks(campaignId: string): Promise<LinkRow[]> {
  const rows: LinkRow[] = []
  for (let page = 1; ; page += 1) {
    const response = await fetch(`/api/campaigns/${campaignId}/links?page=${page}&perPage=100`)
    if (!response.ok) throw new Error('The campaign’s links could not be loaded.')
    const body = (await response.json()) as { links: LinkRow[]; total: number }
    rows.push(...body.links)
    if (rows.length >= body.total || body.links.length === 0) return rows
  }
}
