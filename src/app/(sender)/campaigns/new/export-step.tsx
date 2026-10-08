'use client'

/**
 * Step 3 — review, generate, export, sign. SPEC.md §5.3.
 *
 * The order here is mandatory and must not be rearranged:
 *
 *   1. security checkpoint warning
 *   2. generate keypairs in browser memory
 *   3. FORCE the CSV download — Continue is disabled until it fires
 *   4. build and sign batches, showing `Batch n / N signed`
 *   5. offer the CSV again, and say it will not survive navigation
 *
 * Step 3 is the gate. It is not a confirmation the user can dismiss: the
 * sender holds the only copy of every seed, and a campaign that goes live
 * before they have it has created funds nobody can claim (SPEC.md §1.2).
 */
import { Button, SolidCard, WarningPanel } from '@/components/ui'
import { PhrasePanel } from './phrase-panel'
import type { CostBreakdown } from '@/lib/campaign/cost'
import type { EphemeralKey } from '@/lib/campaign/keygen'
import type { BatchProgress, Phase } from './use-wizard'

export function ExportStep({
  phase,
  linkCount,
  keys,
  downloaded,
  filename,
  cost,
  progress,
  error,
  onGenerate,
  onDownload,
  onSign,
  onFinish,
  screening,
  phraseConfirmed,
  onPhrase,
}: {
  phase: Phase
  linkCount: number
  keys: EphemeralKey[]
  downloaded: boolean
  filename: string | null
  cost: CostBreakdown | null
  progress: BatchProgress
  error: string | null
  onGenerate: () => void
  onDownload: () => void
  onSign: () => void
  onFinish: () => void
  campaignId: string | null
  appUrl: string
  screening: boolean
  /** Recovery phrase (#77): the keys are derived from it, so it comes first. */
  phraseConfirmed: boolean
  onPhrase: (phrase: string) => void
}) {
  const generated = keys.length > 0

  return (
    <SolidCard>
      <h2 className="text-headline-sm text-on-surface">Review &amp; create</h2>

      {/* 1 — the checkpoint, before anything is generated. */}
      <div className="mt-lg">
        <WarningPanel
          heading="You will hold the only copy of these keys"
          consequence="We cannot recover them for you if lost."
        >
          Each link is a key derived in this tab from your recovery phrase. Neither the
          phrase nor the keys are ever sent to Kleym, so nothing on our side can
          reproduce them. If the export AND the phrase are lost, those funds stay locked
          until the campaign expires and you reclaim them.
        </WarningPanel>
      </div>

      {!generated && (
        <div className="mt-lg">
          <PhrasePanel confirmed={phraseConfirmed} onConfirmed={onPhrase} />
        </div>
      )}

      {cost && (
        <dl className="mt-lg grid grid-cols-2 gap-md font-mono text-label-md max-md:grid-cols-1">
          <div>
            <dt className="text-on-surface-variant">Links</dt>
            <dd className="text-on-surface" data-testid="review-link-count">{linkCount}</dd>
          </div>
          <div>
            <dt className="text-on-surface-variant">Signatures</dt>
            <dd className="text-on-surface">{cost.signatures}</dd>
          </div>
          <div>
            <dt className="text-on-surface-variant">Total to send</dt>
            <dd className="text-on-surface">{cost.totalAmount}</dd>
          </div>
          <div>
            <dt className="text-on-surface-variant">{cost.sponsored ? 'Kleym reserve locked' : 'Reserve locked'}</dt>
            <dd className="text-on-surface">{cost.totalReserve} XLM</dd>
          </div>
          <div>
            <dt className="text-on-surface-variant">{cost.sponsored ? 'Kleym fee bid' : 'Network fee bid'}</dt>
            <dd className="text-on-surface">{cost.totalFee} XLM</dd>
          </div>
        </dl>
      )}

      {error && (
        <p role="alert" className="mt-lg font-mono text-label-md text-error">
          {error}
        </p>
      )}

      <div className="mt-xl flex flex-col gap-md">
        {/* 2 — generate. */}
        {!generated && (
          <Button
            type="button"
            onClick={onGenerate}
            // Not before the phrase is confirmed: the keys come FROM it.
            disabled={phase === 'generating' || !phraseConfirmed}
            data-testid="generate-keys"
            className="self-start"
          >
            {phase === 'generating' ? 'Generating…' : 'Generate keys'}
          </Button>
        )}

        {/* 3 — the export, and the gate. */}
        {generated && (
          <>
            <Button
              type="button"
              variant={downloaded ? 'secondary' : 'primary'}
              icon="download"
              onClick={onDownload}
              data-testid="download-secrets"
              className="self-start"
            >
              {downloaded ? 'Download again' : 'Download secrets and continue'}
            </Button>

            <p
              className="font-mono text-label-sm text-on-surface-variant"
              data-testid="download-state"
              data-downloaded={downloaded ? 'true' : 'false'}
            >
              {downloaded
                ? `Saved as ${filename}. Keep it somewhere you would keep a password.`
                : `${keys.length} keys are held in this tab only. Export them to continue.`}
            </p>
          </>
        )}

        {/* 4 — sign. Unreachable until the export has fired. */}
        {generated && phase !== 'complete' && phase !== 'partial' && (
          <Button
            type="button"
            variant="claim"
            onClick={onSign}
            disabled={!downloaded || phase === 'batching'}
            data-testid="sign-batches"
            className="self-start"
          >
            {phase === 'batching'
              ? `Batch ${progress.signed + 1} / ${progress.total} — approve in your wallet`
              : `Sign ${cost?.signatures ?? 0} batch${(cost?.signatures ?? 0) === 1 ? '' : 'es'}`}
          </Button>
        )}

        {phase === 'batching' && (
          <p role="status" className="font-mono text-label-md text-on-surface">
            Batch {progress.signed} / {progress.total} signed
            {progress.failed > 0 && ` · ${progress.failed} failed`}
            {screening && ' · each batch is screened by your organisation first, which can take a few seconds'}
          </p>
        )}

        {/* 5 — done: offer the file again, and say what happens on navigation. */}
        {(phase === 'complete' || phase === 'partial') && (
          <>
            <p role="status" className="font-mono text-label-md text-on-surface">
              {phase === 'complete'
                ? `All ${progress.total} batches submitted. Check the campaign for ledger confirmation before sharing links.`
                : `${progress.signed} of ${progress.total} batches went through. The rest can be retried from the campaign.`}
            </p>
            <WarningPanel
              heading="Last chance to save the export"
              consequence="Leaving this page discards the keys."
            >
              They exist in this tab and in the file you downloaded. Nowhere else.
            </WarningPanel>
            <p className="text-body-md text-on-surface-variant">
              After the campaign shows funded links, send each recipient only their own claim URL from your saved CSV. Keep the complete CSV private.
            </p>
            <div className="flex gap-md">
              <Button type="button" variant="secondary" icon="download" onClick={onDownload}>
                Download again
              </Button>
              <Button type="button" onClick={onFinish}>
                Go to campaign
              </Button>
            </div>
          </>
        )}
      </div>
    </SolidCard>
  )
}
