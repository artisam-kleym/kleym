'use client'

/**
 * The three-step campaign wizard. SPEC.md §5.3.
 *
 * Everything here runs in the browser, because everything here touches keys.
 * The only thing that crosses to the server is `publicHalves` — the G…
 * addresses — plus the campaign's own metadata (AGENT.md §1).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Stepper } from '@/components/ui'
import { generateEphemeralKeys, publicHalves } from '@/lib/campaign/keygen'
import { parseLabels } from '@/lib/campaign/csv'
import { affordability, computeCost, type CostBreakdown } from '@/lib/campaign/cost'
import { triggerDownload } from './download-gate'
import { canContinuePastExport, useWizard, type WizardConfig } from './use-wizard'
import { AssetStep, RecipientsStep } from './steps'
import { ExportStep } from './export-step'
import { connectWallet, signEnvelope, walletErrorMessage } from '@/lib/wallet/signing'

const STEPS = [
  { title: 'Asset & amount' },
  { title: 'Recipients & expiry' },
  { title: 'Review & create' },
]

interface Balance {
  assetCode: string
  assetIssuer: string | null
  balance: string
}

/** Stable identity, so a memo keyed on it does not invalidate every render. */
const EMPTY_BALANCES: Balance[] = []

export function CampaignWizard(config: WizardConfig) {
  const router = useRouter()
  const wizard = useWizard()

  const [draft, setDraft] = useState({
    name: '',
    network: 'testnet' as 'testnet' | 'public',
    senderPublicKey: '',
    assetCode: 'XLM',
    assetIssuer: '',
    amountPerLink: '',
    linkCount: 10,
    expiresAt: defaultExpiry(),
  })

  /*
   * One piece of state keyed by the address it describes, rather than three
   * that have to be cleared together. Clearing them in an effect when the
   * address changes is a second render with stale balances on screen — and
   * "stale balances" here means the affordability check answering about an
   * account the sender is no longer using.
   */
  const [lookup, setLookup] = useState<{
    key: string
    exists: boolean | null
    balances: Balance[]
  }>({ key: '', exists: null, balances: [] })

  const complete = draft.senderPublicKey.length === 56
  const fresh = lookup.key === draft.senderPublicKey

  // All three derived, not stored: "still checking" is precisely "the address
  // is complete and the answer on hand is about a different one".
  const checking = complete && !fresh
  const accountExists = complete && fresh ? lookup.exists : null
  const balances = useMemo(
    () => (complete && fresh ? lookup.balances : EMPTY_BALANCES),
    [complete, fresh, lookup.balances],
  )
  const [reservePerLink, setReservePerLink] = useState<string | null>(null)
  const [labels, setLabels] = useState<string[]>([])
  const [labelError, setLabelError] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)

  const patch = useCallback((next: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...next })), [])

  /* Live reserve. SPEC.md §3.2 — never a constant in the UI. */
  useEffect(() => {
    let cancelled = false
    void fetch('/api/stellar/reserve')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled && body) setReservePerLink(body.reservePerLink)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  /* The sender's balances, so step 1 can only offer assets they hold. */
  useEffect(() => {
    const key = draft.senderPublicKey
    if (key.length !== 56) return

    let cancelled = false
    void fetch(`/api/stellar/account?publicKey=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return
        setLookup({ key, exists: body?.exists ?? false, balances: body?.balances ?? [] })
      })
      .catch(() => {
        // Recorded against this key so the UI stops saying "checking…" — an
        // unreachable Horizon is an answer the sender needs, not a spinner.
        if (!cancelled) setLookup({ key, exists: null, balances: EMPTY_BALANCES })
      })
    return () => {
      cancelled = true
    }
  }, [draft.senderPublicKey, draft.network])

  const cost: CostBreakdown | null = useMemo(() => {
    if (!reservePerLink || !draft.amountPerLink || draft.linkCount < 1) return null
    try {
      return computeCost({
        amountPerLink: draft.amountPerLink,
        linkCount: draft.linkCount,
        reservePerLink,
        maxOpsPerBatch: config.maxOpsPerBatch,
        baseFeeStroops: config.baseFeeStroops,
      })
    } catch {
      // An amount that is not a number yet. Not an error to shout about while
      // the sender is still typing.
      return null
    }
  }, [reservePerLink, draft.amountPerLink, draft.linkCount, config])

  const affordable = useMemo(() => {
    if (!cost || balances.length === 0) return null
    const native = balances.find((b) => b.assetIssuer === null) ?? null
    const chosen = balances.find(
      (b) => b.assetCode === draft.assetCode && (b.assetIssuer ?? '') === draft.assetIssuer,
    )
    return affordability(
      cost,
      { assetBalance: chosen?.balance ?? null, xlmBalance: native?.balance ?? null },
      draft.assetIssuer === '',
    )
  }, [cost, balances, draft.assetCode, draft.assetIssuer])

  /*
   * beforeunload during batching. SPEC.md §5.3.
   *
   * Armed only while batches are outstanding: a guard on every step trains the
   * sender to dismiss it, and then it is not there when it matters.
   */
  useEffect(() => {
    if (wizard.phase !== 'batching' && wizard.phase !== 'awaiting-download') return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Browsers show their own text; returnValue is what makes it appear.
      event.returnValue = 'Links that have not been signed yet will be lost.'
      return event.returnValue
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [wizard.phase])

  const onLabels = useCallback(
    (raw: string) => {
      if (raw.trim() === '') {
        setLabels([])
        setLabelError(null)
        return
      }
      const parsed = parseLabels(raw, draft.linkCount)
      if (parsed.ok) {
        setLabels(parsed.labels)
        setLabelError(null)
        return
      }
      setLabels([])
      setLabelError(labelErrorMessage(parsed, draft.linkCount))
    },
    [draft.linkCount],
  )

  const onGenerate = useCallback(() => {
    wizard.setError(null)
    wizard.setPhase('generating')
    try {
      wizard.replaceKeys(generateEphemeralKeys(draft.linkCount, labels))
      wizard.setPhase('awaiting-download')
    } catch (error) {
      wizard.setPhase('editing')
      wizard.setError(error instanceof Error ? error.message : 'Could not generate keys.')
    }
  }, [draft.linkCount, labels, wizard])

  /* THE GATE. Only this can open it, and only after the file is written. */
  const onDownload = useCallback(() => {
    try {
      const result = triggerDownload(wizard.keys, draft.name, config.appUrl)
      setFilename(result.filename)
      if (result.fired) wizard.markDownloaded()
    } catch (error) {
      wizard.setError(error instanceof Error ? error.message : 'The export did not complete.')
    }
  }, [wizard, draft.name, config.appUrl])

  const onSign = useCallback(async () => {
    if (!canContinuePastExport(wizard.downloaded, wizard.keys)) return
    wizard.setError(null)
    wizard.setPhase('batching')

    try {
      const address = await connectWallet(draft.network)
      if (address !== draft.senderPublicKey) {
        wizard.setPhase('awaiting-download')
        wizard.setError('That wallet is signed in to a different account than the funding account.')
        return
      }

      const campaignId = await createCampaign(draft, wizard.keys.length)
      wizard.setCampaignId(campaignId)
      await registerLinks(campaignId, wizard.keys)

      const total = cost?.signatures ?? 1
      wizard.setProgress({ signed: 0, total, failed: 0 })

      let signed = 0
      let failed = 0
      for (let i = 0; i < total; i += 1) {
        const prepared = await prepareBatch(campaignId)
        if (!prepared) break
        try {
          const signedXdr = await signEnvelope(prepared.xdr, draft.network, draft.senderPublicKey)
          await submitBatch(campaignId, prepared.sequence, signedXdr)
          signed += 1
        } catch {
          failed += 1
        }
        wizard.setProgress({ signed, total, failed })
      }

      wizard.setPhase(failed > 0 ? 'partial' : 'complete')
    } catch (error) {
      wizard.setPhase('awaiting-download')
      wizard.setError(await walletErrorMessage(error))
    }
  }, [wizard, draft, cost])

  const onFinish = useCallback(() => {
    router.push(wizard.campaignId ? `/campaigns/${wizard.campaignId}` : '/dashboard')
  }, [router, wizard.campaignId])

  const canAdvance = useMemo(() => {
    if (wizard.step === 0) {
      return (
        draft.name.trim().length > 0 &&
        draft.senderPublicKey.length === 56 &&
        accountExists === true &&
        draft.amountPerLink.trim().length > 0
      )
    }
    if (wizard.step === 1) {
      return (
        draft.linkCount >= 1 &&
        draft.linkCount <= config.maxLinksPerCampaign &&
        draft.expiresAt.length > 0 &&
        labelError === null &&
        cost !== null
      )
    }
    return false
  }, [wizard.step, draft, accountExists, config.maxLinksPerCampaign, labelError, cost])

  return (
    <div className="mt-2xl grid grid-cols-[240px_1fr] gap-2xl max-lg:grid-cols-1">
      <Stepper steps={summarise(STEPS, draft, cost)} current={wizard.step} />

      <div>
        {wizard.step === 0 && (
          <AssetStep
            draft={draft}
            onChange={patch}
            balances={balances}
            accountExists={accountExists}
            checking={checking}
          />
        )}
        {wizard.step === 1 && (
          <RecipientsStep
            draft={draft}
            onChange={patch}
            labels={labels}
            labelError={labelError}
            onLabels={onLabels}
            cost={cost}
            reserveSource={reservePerLink}
            maxLinks={config.maxLinksPerCampaign}
            maxOpsPerBatch={config.maxOpsPerBatch}
            affordable={affordable}
          />
        )}
        {wizard.step === 2 && (
          <ExportStep
            phase={wizard.phase}
            keys={wizard.keys}
            downloaded={wizard.downloaded}
            filename={filename}
            cost={cost}
            progress={wizard.progress}
            error={wizard.error}
            onGenerate={onGenerate}
            onDownload={onDownload}
            onSign={() => void onSign()}
            onFinish={onFinish}
          />
        )}

        <div className="mt-lg flex gap-md">
          {wizard.step > 0 && (
            /*
             * Back stays available on step 3 until batches are in flight.
             * Without it the review step is a dead end — a sender who spots a
             * wrong amount there would have to reload, and a reload after
             * generating discards keys with no warning at all.
             *
             * Going back DISCARDS the generated keys, which shuts the gate:
             * any file already downloaded describes keys that no longer exist,
             * and signing against it would create a campaign whose secrets the
             * sender does not hold.
             */
            <Button
              type="button"
              variant="secondary"
              icon="arrow_back"
              disabled={wizard.phase === 'batching' || wizard.phase === 'complete' || wizard.phase === 'partial'}
              onClick={() => {
                wizard.replaceKeys([])
                wizard.setPhase('editing')
                wizard.setError(null)
                wizard.setStep(wizard.step - 1)
              }}
            >
              Back
            </Button>
          )}
          {wizard.step < 2 && (
            <Button
              type="button"
              icon="arrow_forward"
              disabled={!canAdvance}
              data-testid="next-step"
              onClick={() => wizard.setStep(wizard.step + 1)}
            >
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── server calls. Public halves only. ─────────────────────────────────── */

function idempotencyKey(): string {
  return crypto.randomUUID()
}

async function createCampaign(
  draft: { name: string; network: string; senderPublicKey: string; assetCode: string; assetIssuer: string; amountPerLink: string; expiresAt: string },
  linkCount: number,
): Promise<string> {
  const response = await fetch('/api/campaigns', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey() },
    body: JSON.stringify({
      name: draft.name,
      network: draft.network,
      senderPublicKey: draft.senderPublicKey,
      assetCode: draft.assetCode,
      assetIssuer: draft.assetIssuer === '' ? undefined : draft.assetIssuer,
      amountPerLink: draft.amountPerLink,
      linkCount,
      expiresAt: new Date(draft.expiresAt).toISOString(),
    }),
  })
  if (!response.ok) throw new Error((await problemDetail(response)) ?? 'The campaign could not be created.')
  return (await response.json()).id as string
}

/** ONLY the public halves leave the browser. AGENT.md §1. */
async function registerLinks(campaignId: string, keys: Parameters<typeof publicHalves>[0]): Promise<void> {
  const response = await fetch(`/api/campaigns/${campaignId}/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey() },
    body: JSON.stringify(publicHalves(keys)),
  })
  if (!response.ok) throw new Error((await problemDetail(response)) ?? 'The links could not be registered.')
}

async function prepareBatch(campaignId: string): Promise<{ sequence: number; xdr: string } | null> {
  const response = await fetch(`/api/campaigns/${campaignId}/batches/prepare`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!response.ok) return null
  const body = await response.json()
  return { sequence: body.sequence, xdr: body.xdr }
}

async function submitBatch(campaignId: string, sequence: number, signedXdr: string): Promise<void> {
  const response = await fetch(`/api/campaigns/${campaignId}/batches/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey() },
    body: JSON.stringify({ sequence, signedXdr }),
  })
  if (!response.ok) throw new Error((await problemDetail(response)) ?? 'The batch was rejected.')
}

async function problemDetail(response: Response): Promise<string | null> {
  const body = await response.json().catch(() => null)
  return body?.detail ?? body?.errors?.[0]?.message ?? null
}

/* ── helpers ───────────────────────────────────────────────────────────── */

function defaultExpiry(): string {
  const date = new Date(Date.now() + 30 * 86_400_000)
  return date.toISOString().slice(0, 16)
}

function labelErrorMessage(
  parsed: Exclude<ReturnType<typeof parseLabels>, { ok: true }>,
  linkCount: number,
): string {
  switch (parsed.reason) {
    case 'seed':
      return `Line ${parsed.line} is a secret key. Kleym never accepts one — remove it, and treat that key as compromised.`
    case 'address':
      return `Line ${parsed.line} is a Stellar address. Labels are your own notes; each link is claimed by whoever opens it, so there is no address to record.`
    case 'too-many':
      return `${parsed.found} labels for ${linkCount} links. Raise the link count or remove some.`
    case 'empty':
      return 'No labels found.'
  }
}

function summarise(
  steps: { title: string }[],
  draft: { assetCode: string; amountPerLink: string; linkCount: number },
  cost: CostBreakdown | null,
) {
  return steps.map((step, index) => ({
    ...step,
    summary:
      index === 0 && draft.amountPerLink
        ? `${draft.amountPerLink} ${draft.assetCode} per link`
        : index === 1 && cost
          ? `${draft.linkCount} links · ${cost.signatures} signature${cost.signatures === 1 ? '' : 's'}`
          : undefined,
  }))
}
