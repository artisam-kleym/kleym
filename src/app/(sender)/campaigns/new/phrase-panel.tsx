'use client'

/**
 * The recovery phrase (#77), shown once, before any key is generated.
 *
 * The phrase is held in this component's state while it is on screen and
 * handed to the wizard by callback the moment the sender confirms — no
 * storage, no URL, no logging (AGENT.md §1, §4.5). Two confirmations gate the
 * way forward, and the second one names the trade honestly: one phrase now
 * reconstructs every campaign derived from it. That is a concentration of
 * risk as well as a reduction in the chance of loss, and the sender should
 * choose it knowing both.
 */
import { useState } from 'react'
import { Button, WarningPanel } from '@/components/ui'
import { generatePhrase, isValidPhrase, normalisePhrase } from '@/lib/campaign/derive'

type Mode = 'choose' | 'new' | 'existing'

export function PhrasePanel({ onConfirmed, confirmed }: { onConfirmed: (phrase: string) => void; confirmed: boolean }) {
  const [mode, setMode] = useState<Mode>('choose')
  const [phrase, setPhrase] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [stored, setStored] = useState(false)
  const [understood, setUnderstood] = useState(false)

  if (confirmed) {
    return (
      <div className="rounded-lg border border-outline-variant/50 bg-surface-container p-md">
        <p className="text-label-md font-semibold text-on-surface">Recovery phrase confirmed</p>
        <p className="mt-1 text-body-md text-on-surface-variant">
          The keys below are derived from it. You can regenerate this campaign’s secrets file from the phrase at any
          time, from the campaign page.
        </p>
      </div>
    )
  }

  const words = phrase ? phrase.split(' ') : []
  const existingValid = mode === 'existing' && typed.trim().length > 0 && isValidPhrase(typed)
  const canConfirm = mode === 'new' ? phrase !== null && stored && understood : existingValid && understood

  function confirm() {
    const value = mode === 'new' ? phrase : normalisePhrase(typed)
    if (!value) return
    onConfirmed(value)
    // Drop the local copies; the wizard holds the one that matters now.
    setPhrase(null)
    setTyped('')
  }

  return (
    <div className="flex flex-col gap-md rounded-lg border border-outline-variant/50 bg-surface-container p-md" data-testid="phrase-panel">
      <div>
        <p className="text-label-md font-semibold text-on-surface">Recovery phrase</p>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Every link’s key is derived from a twelve-word phrase you keep, so a lost secrets file can be regenerated
          from the phrase. Kleym never sees the phrase or any key made from it.
        </p>
      </div>

      {mode === 'choose' && (
        <div className="flex flex-wrap gap-sm">
          <Button type="button" onClick={() => { setPhrase(generatePhrase()); setMode('new') }} data-testid="phrase-new">
            Create a new phrase
          </Button>
          <Button type="button" variant="secondary" onClick={() => setMode('existing')} data-testid="phrase-existing">
            Use a phrase I already have
          </Button>
        </div>
      )}

      {mode === 'new' && phrase && (
        <>
          <ol className="grid grid-cols-3 gap-xs font-mono text-label-md text-on-surface max-md:grid-cols-2" data-testid="phrase-words">
            {words.map((word, index) => (
              <li key={index} className="rounded-lg border border-outline-variant/50 bg-surface px-3 py-2">
                <span className="mr-2 text-on-surface-variant">{index + 1}.</span>
                {word}
              </li>
            ))}
          </ol>
          <p className="text-body-md text-on-surface-variant">
            Write these down, in order, on paper. This is the only time they are shown.
          </p>
          <label className="flex items-start gap-sm text-body-md text-on-surface">
            <input type="checkbox" checked={stored} onChange={(e) => setStored(e.target.checked)} className="mt-1 h-5 w-5" data-testid="phrase-stored" />
            <span>I have written down all twelve words and stored them where only I can reach them.</span>
          </label>
        </>
      )}

      {mode === 'existing' && (
        <>
          <label className="flex flex-col gap-xs">
            <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Your phrase</span>
            <textarea
              rows={3}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              data-testid="phrase-input"
              className="rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface"
            />
          </label>
          {typed.trim().length > 0 && !existingValid && (
            <p role="alert" className="font-mono text-label-sm text-error">That is not a valid twelve, fifteen, eighteen, twenty-one or twenty-four word phrase.</p>
          )}
        </>
      )}

      {mode !== 'choose' && (
        <>
          <WarningPanel heading="One phrase, every campaign" consequence="If the phrase leaks, every campaign made from it is exposed at once.">
            This phrase reconstructs the keys of every campaign you derive from it — not just this one. Before,
            losing a file cost one campaign; now, one phrase kept safe protects all of them, and one phrase leaked
            exposes all of them. Kleym holds no copy and no share of it, and cannot help if it is lost.
          </WarningPanel>
          <label className="flex items-start gap-sm text-body-md text-on-surface">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-1 h-5 w-5" data-testid="phrase-understood" />
            <span>I understand this phrase protects — and exposes — every campaign derived from it.</span>
          </label>
          <div className="flex flex-wrap gap-sm">
            <Button type="button" onClick={confirm} disabled={!canConfirm} data-testid="phrase-confirm">
              Continue
            </Button>
            <Button type="button" variant="tertiary" onClick={() => { setMode('choose'); setPhrase(null); setTyped(''); setStored(false); setUnderstood(false) }}>
              Start over
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
