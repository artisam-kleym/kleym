'use client'

/**
 * How the sender distributes the links. SPEC.md §6.5, criterion 7.
 *
 * The choice is presented WITH its trade-off, at the moment it is made. Email
 * delivery is the one path where a claim URL leaves this tab and passes
 * through Kleym's infrastructure, and a sender who does not want that should
 * be told plainly here — not in a document they will not read — that the
 * alternative is to send the file themselves.
 *
 * Handing the sender the file is the DEFAULT. Email is opt-in, because the
 * safer option should not be the one you have to find.
 */
import { useState } from 'react'
import { Button, WarningPanel } from '@/components/ui'
import type { EphemeralKey } from '@/lib/campaign/keygen'
import { claimUrl } from '@/lib/campaign/csv'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function DeliveryChoice({
  campaignId,
  keys,
  appUrl,
}: {
  campaignId: string
  keys: EphemeralKey[]
  appUrl: string
}) {
  const [phase, setPhase] = useState<'idle' | 'confirming' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<{ queued: number; skipped: number } | null>(null)

  // Only links whose label is an address can be emailed. The rest are the
  // sender's to distribute, which is the point of the CSV.
  const addressed = keys.filter((key) => key.label !== null && EMAIL.test(key.label))

  async function send() {
    setError(null)
    setPhase('sending')
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/deliver`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          recipients: addressed.map((key) => ({
            publicKey: key.publicKey,
            email: key.label,
            /*
             * Built HERE, in the tab that holds the seeds. The server has
             * never seen these URLs and cannot reconstruct them — that is the
             * whole shape of SPEC.md §6.5.
             */
            claimUrl: claimUrl(appUrl, key.secret),
          })),
        }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { detail?: string }
        throw new Error(body.detail ?? 'The emails could not be queued.')
      }
      const body = (await response.json()) as { queued: number; skipped: unknown[] }
      setReport({ queued: body.queued, skipped: body.skipped.length })
      setPhase('sent')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The emails could not be queued.')
      setPhase('idle')
    }
  }

  if (phase === 'sent' && report) {
    return (
      <div className="rounded-lg border border-outline-variant/50 bg-surface-container p-md">
        <p className="text-body-md text-on-surface">
          {report.queued} {report.queued === 1 ? 'email is' : 'emails are'} on the way.
          {report.skipped > 0 && ` ${report.skipped} could not be sent.`}
        </p>
        <p className="mt-sm text-body-md text-on-surface-variant">
          Each recipient will need a six-digit code sent to the same address. Keep the file
          you downloaded — it is the only other copy of these links.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-outline-variant/50 bg-surface-container p-md">
      <h3 className="text-body-md font-bold text-on-surface">Getting the links to people</h3>
      <p className="mt-sm text-body-md text-on-surface-variant">
        You have the file. Sending it on yourself — however you already talk to these
        people — means the links never leave your hands.
      </p>

      {addressed.length === 0 ? (
        <p className="mt-md text-body-md text-on-surface-variant">
          Kleym can email them for you if you label each link with an address. None of these
          are labelled with one, so this campaign is yours to distribute.
        </p>
      ) : phase === 'confirming' ? (
        <div className="mt-md">
          <WarningPanel
            heading="Emailing sends the links through Kleym"
            consequence="If you would rather that never happened, send the file yourself instead."
          >
            To email {addressed.length} {addressed.length === 1 ? 'link' : 'links'}, this tab
            passes {addressed.length === 1 ? 'it' : 'them'} to Kleym, which hands{' '}
            {addressed.length === 1 ? 'it' : 'them'} to the mail provider and discards{' '}
            {addressed.length === 1 ? 'it' : 'them'}. Nothing is stored or logged. Each
            recipient also needs a six-digit code sent to the same address.
          </WarningPanel>
          <div className="mt-md flex flex-wrap gap-sm">
            <Button type="button" onClick={send} disabled={phase !== 'confirming'}>
              Send {addressed.length} {addressed.length === 1 ? 'email' : 'emails'}
            </Button>
            <Button type="button" variant="tertiary" onClick={() => setPhase('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-md">
          <p className="text-body-md text-on-surface-variant">
            Or Kleym can email {addressed.length} of them for you, to the addresses you
            labelled.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-sm"
            onClick={() => setPhase('confirming')}
            disabled={phase === 'sending'}
          >
            {phase === 'sending' ? 'Sending…' : 'Email the links'}
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-md text-body-md text-error">
          {error}
        </p>
      )}
    </div>
  )
}
