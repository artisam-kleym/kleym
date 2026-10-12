'use client'

/**
 * The three-step campaign wizard. SPEC.md §5.3.
 *
 * Everything here runs in the browser, because everything here touches keys.
 * The only thing that crosses to the server is `publicHalves` — the G…
 * addresses — plus the campaign's own metadata (AGENT.md §1).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { StrKey } from '@stellar/stellar-sdk'
import { Button, Stepper } from '@/components/ui'
import { deriveEphemeralKeys, publicHalves, type Attestation } from '@/lib/campaign/keygen'
import { phraseFingerprint, randomCampaignIndex } from '@/lib/campaign/derive'
import { parseLabels, buildRecipientListCsv, hasPrizeAmountColumn } from '@/lib/campaign/csv'
import { isStellarAmount } from '@/lib/stellar/amount'
import { updatePrizeAmount } from '@/lib/campaign/prize-amounts'
import { parseReceiveAs, receiveAsErrorMessage, type ReceiveAsEntry } from '@/lib/campaign/receive-as'
import { affordability, computeCost, type CostBreakdown } from '@/lib/campaign/cost'
import { triggerDownload } from './download-gate'
import { canContinuePastExport, useWizard, type WizardConfig } from './use-wizard'
import { AssetStep, RecipientsStep } from './steps'
import { PrizeAmounts } from './prize-amounts'
import { ExportStep } from './export-step'
import { useStepUp } from '@/components/mfa/use-step-up'
import { connectWallet, signEnvelope, walletErrorMessage } from '@/lib/wallet/signing'
import { localExpiry, expiryDescription, expiryError, presetExpiry, type ExpiryChoice } from '@/lib/campaign/expiry'
import { submitFundingBatch } from '@/lib/campaign/funding-submit'
import { holdWalletHandoff } from '@/lib/wallet/handoff'

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
const subscribeHydration = () => () => {}
const hydratedClient = () => true
const hydratedServer = () => false

export function CampaignWizard(config: WizardConfig) {
  const hydrated = useSyncExternalStore(subscribeHydration, hydratedClient, hydratedServer)
  const router = useRouter()
  const wizard = useWizard()
  const stepUp = useStepUp()
  const registeredCampaign = useRef<string | null>(null)
  const signingInProgress = useRef(false)

  // A public app-opening link restarts in another document; it cannot move keys.
  useEffect(() => {
    if (wizard.step === 2 && wizard.phase !== 'complete') return holdWalletHandoff()
  }, [wizard.step, wizard.phase])

  const reissue = config.reissue ?? null
  /** Template (#82): terms and list prefilled; for a prepared run the campaign already exists. */
  const template = config.template ?? null
  /** A prepared run's terms and list cannot change here: they are the draft's, fixed at preparation. */
  const locked = template?.draftCampaignId !== null && template?.draftCampaignId !== undefined
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>(template || reissue ? 'custom' : '30d')
  const [expiryNow, setExpiryNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setExpiryNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const [draft, setDraft] = useState({
    // A reissue (#78) carries the source campaign's terms; only the expiry is new.
    // A template (#82) carries every term, and its own expiry offset.
    name: template?.name ?? (reissue ? `${reissue.name.slice(0, 110)} (renewal)` : ''),
    network: template?.network ?? reissue?.network ?? config.stellar.network,
    senderPublicKey: template?.senderPublicKey ?? reissue?.senderPublicKey ?? '',
    assetCode: template?.assetCode ?? reissue?.assetCode ?? config.stellar.defaultAsset.assetCode,
    assetIssuer: template ? (template.assetIssuer ?? '') : reissue ? (reissue.assetIssuer ?? '') : config.stellar.defaultAsset.assetIssuer,
    amountPerLink: template?.amountPerLink ?? reissue?.amountPerLink ?? '',
    linkCount: template ? Math.max(1, template.linkCount) : reissue ? Math.max(1, reissue.outstanding) : 10,
    expiresAt: template ? localExpiry(new Date(template.expiresAt)) : reissue?.draftExpiry ? localExpiry(new Date(reissue.draftExpiry)) : reissue ? '' : defaultExpiry(),
  })
  /** Reminder points (#78): days before expiry at which emailed, unclaimed recipients hear again. */
  const [reminderDays, setReminderDays] = useState<number[]>(template?.reminderDaysBefore ?? reissue?.draftReminders ?? [])

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

  const [lookupVersion, setLookupVersion] = useState(0)
  const lookupKey = `${draft.network}:${draft.senderPublicKey}`
  const complete = StrKey.isValidEd25519PublicKey(draft.senderPublicKey)
  const fresh = lookup.key === lookupKey

  // All three derived, not stored: "still checking" is precisely "the address
  // is complete and the answer on hand is about a different one".
  const checking = complete && !fresh
  const accountExists = complete && fresh ? lookup.exists : null
  const balances = useMemo(
    () => (complete && fresh ? lookup.balances : EMPTY_BALANCES),
    [complete, fresh, lookup.balances],
  )
  const [reservePerLink, setReservePerLink] = useState<string | null>(null)
  const [sponsoredReservePerLink, setSponsoredReservePerLink] = useState<string | null>(null)
  const sponsored = draft.assetCode === 'USDC' && !locked
  /* The template's recipient list (#82) is the labels field's initial text, parsed once as initial state. */
  const [labelsInitial] = useState(config.template?.recipientsCsv ?? '')
  const [recipientsCsv, setRecipientsCsv] = useState(labelsInitial)
  const initialRecipients = useMemo(() => {
    if (labelsInitial.trim() === '') return null
    const parsed = parseLabels(labelsInitial, Math.max(1, config.template?.linkCount ?? 0))
    return parsed.ok ? parsed : null
  }, [labelsInitial, config.template?.linkCount])
  const [labels, setLabels] = useState<string[]>(() => initialRecipients?.labels ?? [])
  const [attestations, setAttestations] = useState<(Attestation | null)[]>(() => initialRecipients?.attestations ?? [])
  /** Per-link amounts (#73) from the pasted CSV; empty means every link pays the default. */
  const [amounts, setAmounts] = useState<(string | null)[]>(() => initialRecipients?.amounts ?? [])
  const [labelError, setLabelError] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  /** Who may claim (#79). Open unless the sender says otherwise. */
  const [claimPolicy, setClaimPolicy] = useState<'open' | 'code' | 'email' | 'passkey'>(template?.claimPolicy ?? reissue?.draftPolicy ?? 'open')
  /**
   * Receive-as (#74). The raw field is state; its parse is DERIVED from the
   * raw text AND the campaign asset, so changing the asset after typing the
   * list re-validates "differs from the campaign asset" here rather than as
   * a 400 at signing.
   */
  const [receiveAsRaw, setReceiveAsRaw] = useState(template?.receiveAsRaw ?? reissue?.draftReceiveAs ?? '')
  const receiveAsParsed = useMemo(
    () => parseReceiveAs(receiveAsRaw, { assetCode: draft.assetCode, assetIssuer: draft.assetIssuer }),
    [receiveAsRaw, draft.assetCode, draft.assetIssuer],
  )
  const receiveAs = useMemo<ReceiveAsEntry[]>(() => (receiveAsParsed.ok ? receiveAsParsed.assets : []), [receiveAsParsed])
  const receiveAsError = receiveAsParsed.ok ? null : receiveAsErrorMessage(receiveAsParsed)
  const onReceiveAs = useCallback((raw: string) => setReceiveAsRaw(raw), [])
  const [allowExchangeDeposit, setAllowExchangeDeposit] = useState(template?.allowExchangeDeposit ?? reissue?.draftExchangeDeposit ?? false)
  const [emailReceipts, setEmailReceipts] = useState(false)

  /*
   * Recovery phrase (#77). A REF, like the seeds in useWizard: the phrase must
   * not be part of anything React might serialise, and nothing but keygen
   * reads it. `phraseConfirmed` is the only thing rendered.
   */
  const phrase = useRef<string | null>(null)
  const [phraseConfirmed, setPhraseConfirmed] = useState(false)
  const [derivation, setDerivation] = useState<{ index: number; fingerprint: string } | null>(null)
  const onPhrase = useCallback((value: string) => {
    if (reissue?.keyFingerprint && phraseFingerprint(value) !== reissue.keyFingerprint) {
      wizard.setError('Use the recovery phrase saved for this renewal draft. A different phrase cannot recover its registered links.')
      setPhraseConfirmed(false)
      return
    }
    phrase.current = value
    // A fresh 31-bit index per campaign, so two campaigns from one phrase never share a path.
    setDerivation({ index: reissue?.derivationIndex ?? randomCampaignIndex(), fingerprint: phraseFingerprint(value) })
    setPhraseConfirmed(true)
  }, [reissue, wizard])

  const patch = useCallback((next: Partial<typeof draft>) => {
    if (next.linkCount !== undefined) setAmounts((previous) => previous.slice(0, Math.max(0, next.linkCount!)))
    setDraft((d) => ({ ...d, ...next }))
  }, [])
  const onAmount = useCallback((index: number, value: string) => {
    const next = updatePrizeAmount(amounts, index, value, draft.linkCount)
    setAmounts(next)
    if (hasPrizeAmountColumn(recipientsCsv)) setRecipientsCsv(buildRecipientListCsv(draft.linkCount, labels, attestations, next))
  }, [draft.linkCount, amounts, recipientsCsv, labels, attestations])
  const onResetAmounts = useCallback(() => {
    setAmounts([])
    if (hasPrizeAmountColumn(recipientsCsv)) setRecipientsCsv(buildRecipientListCsv(draft.linkCount, labels, attestations, []))
  }, [draft.linkCount, recipientsCsv, labels, attestations])

  /* Live reserve. SPEC.md §3.2 — never a constant in the UI. */
  useEffect(() => {
    let cancelled = false
    void fetch('/api/stellar/reserve')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled && body) {
          setReservePerLink(body.reservePerLink)
          setSponsoredReservePerLink(body.sponsoredReservePerLink ?? null)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  /* The sender's balances, so step 1 can only offer assets they hold. */
  useEffect(() => {
    const key = draft.senderPublicKey
    if (!StrKey.isValidEd25519PublicKey(key)) return

    let cancelled = false
    const controller = new AbortController()
    const resultKey = `${draft.network}:${key}`
    void fetch(`/api/stellar/account?publicKey=${encodeURIComponent(key)}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error('Balance lookup unavailable'); return r.json() })
      .then((body) => {
        if (cancelled) return
        if (body.network && body.network !== draft.network) throw new Error('Balance network mismatch')
        setLookup({ key: resultKey, exists: body?.exists ?? false, balances: (body?.balances ?? []).map((balance: Balance & { availableBalance?: string }) => ({ ...balance, balance: balance.availableBalance ?? balance.balance })) })
      })
      .catch(() => {
        // Recorded against this key so the UI stops saying "checking…" — an
        // unreachable Horizon is an answer the sender needs, not a spinner.
        if (!cancelled) setLookup({ key: resultKey, exists: null, balances: EMPTY_BALANCES })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [draft.senderPublicKey, draft.network, lookupVersion])

  const cost: CostBreakdown | null = useMemo(() => {
    if (!reservePerLink || !draft.amountPerLink || draft.linkCount < 1) return null
    try {
      return computeCost({
        amountPerLink: draft.amountPerLink,
        amounts: amounts.length > 0 ? amounts : undefined,
        linkCount: draft.linkCount,
        reservePerLink: sponsored ? (sponsoredReservePerLink ?? reservePerLink) : reservePerLink,
        sponsored,
        maxOpsPerBatch: config.maxOpsPerBatch,
        baseFeeStroops: config.baseFeeStroops,
      })
    } catch {
      // An amount that is not a number yet. Not an error to shout about while
      // the sender is still typing.
      return null
    }
  }, [reservePerLink, sponsoredReservePerLink, sponsored, draft.amountPerLink, draft.linkCount, amounts, config])

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
      setRecipientsCsv(raw)
      if (raw.trim() === '') {
        setLabels([])
        setAttestations([])
        setLabelError(null)
        return
      }
      const parsed = parseLabels(raw, draft.linkCount)
      if (parsed.ok) {
        setLabels(parsed.labels)
        setAttestations(parsed.attestations ?? [])
        if (hasPrizeAmountColumn(raw)) setAmounts(parsed.amounts ?? [])
        setLabelError(null)
        return
      }
      setLabels([])
      setAttestations([])
      setLabelError(labelErrorMessage(parsed, draft.linkCount))
    },
    [draft.linkCount],
  )

  const onGenerate = useCallback(() => {
    wizard.setError(null)
    wizard.setPhase('generating')
    try {
      const invalidExpiry = expiryError(draft.expiresAt)
      if (invalidExpiry) throw new Error(`${invalidExpiry} Go back to Recipients & expiry to change it.`)
      if (claimPolicy === 'email') throw new Error('This email-policy template requires built-in delivery. Choose a supported policy in a new campaign for CSV distribution.')
      if (!phrase.current || !derivation) throw new Error('Confirm your recovery phrase first.')
      // CODE policy: a claim code is derived beside each key — from the phrase too, so a regenerated CSV carries it (#79).
      wizard.replaceKeys(deriveEphemeralKeys(phrase.current, derivation.index, draft.linkCount, labels, attestations, amounts, { withCodes: claimPolicy === 'code' }))
      wizard.setPhase('awaiting-download')
    } catch (error) {
      wizard.setPhase('editing')
      wizard.setError(error instanceof Error ? error.message : 'Could not generate keys.')
    }
  }, [draft.linkCount, draft.expiresAt, labels, attestations, amounts, wizard, derivation, claimPolicy])

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
    if (signingInProgress.current || !canContinuePastExport(wizard.downloaded, wizard.keys, wizard.exportConfirmed)) return
    wizard.setError(null)
    const invalidExpiry = expiryError(draft.expiresAt)
    if (invalidExpiry) {
      wizard.setError(`${invalidExpiry} Go back to Recipients & expiry to change it.`)
      return
    }
    signingInProgress.current = true
    try {
      // Claim synchronously before step-up/network awaits, so double taps cannot start another run.
      if (!(await stepUp.ensure())) return
      wizard.setPhase('batching')
      const address = await connectWallet(draft.network, { reuseSession: true })
      if (address !== draft.senderPublicKey) {
        wizard.setPhase('awaiting-download')
        wizard.setError('That wallet is signed in to a different account than the funding account.')
        return
      }

      /*
       * A prepared run (#82) already has its DRAFT campaign — a schedule or
       * "Run now" made it with these terms — so links are registered to it
       * rather than to a new one. Otherwise a campaign from a template is a
       * MANUAL run, recorded as such.
       */
      const campaignId = wizard.campaignId ?? reissue?.draftCampaignId ?? (template?.draftCampaignId
        ? template.draftCampaignId
        : await createCampaign(draft, wizard.keys.length, derivation, claimPolicy, reminderDays, receiveAs, allowExchangeDeposit, template?.templateId ?? null, emailReceipts, buildRecipientListCsv(draft.linkCount, labels, attestations, amounts), reissue?.id ?? null)
      )
      wizard.setCampaignId(campaignId)
      if (registeredCampaign.current !== campaignId) {
        const registered = reissue?.registeredPublicKeys ?? []
        if (registered.length > 0) {
          if (registered.length !== wizard.keys.length || wizard.keys.some((key) => !registered.includes(key.publicKey))) throw new PrepareRefused('The regenerated keys do not match this renewal draft. Use its original recovery phrase.')
        } else await registerLinks(campaignId, wizard.keys)
        registeredCampaign.current = campaignId
      }
      // The download happened locally before this action. Record only that fact;
      // neither the CSV nor its secrets cross this boundary.
      const exported = await fetch(`/api/campaigns/${campaignId}/export`, { method: 'POST' })
      if (!exported.ok) throw new PrepareRefused((await problemDetail(exported)) ?? 'The link backup could not be recorded. Funding has not started.')

      const total = cost?.signatures ?? 1
      wizard.setProgress({ signed: 0, total, failed: 0 })

      let signed = 0
      let failed = 0
      for (let i = 0; i < total; i += 1) {
        const prepared = await prepareBatch(campaignId)
        if (!prepared) break // exhausted: every batch already submitted
        try {
          const signedXdr = await signEnvelope(prepared.xdr, draft.network, draft.senderPublicKey)
          await submitFundingBatch({ campaignId, sequence: prepared.sequence, signedXdr, network: draft.network })
          signed += 1
          wizard.setProgress({ signed, total, failed })
          await waitForBatchConfirmation(campaignId, prepared.sequence)
        } catch (error) {
          failed += 1
          wizard.setError(await walletErrorMessage(error))
          wizard.setProgress({ signed, total, failed })
          break // Resolve this batch before requesting another wallet signature.
        }
        wizard.setProgress({ signed, total, failed })
      }

      if (failed === 0) wizard.setError(null)
      wizard.setPhase(failed > 0 ? 'partial' : 'complete')
    } catch (error) {
      wizard.setPhase('awaiting-download')
      wizard.setError(error instanceof PrepareRefused ? error.message : await walletErrorMessage(error))
    } finally {
      signingInProgress.current = false
    }
  }, [wizard, draft, cost, stepUp, derivation, claimPolicy, reminderDays, receiveAs, allowExchangeDeposit, template, emailReceipts, labels, attestations, amounts, reissue])

  const onFinish = useCallback(() => {
    router.push(wizard.campaignId ? `/campaigns/${wizard.campaignId}` : '/dashboard')
  }, [router, wizard.campaignId])

  const canAdvance = useMemo(() => {
    if (wizard.step === 0) {
      return (
        draft.name.trim().length > 0 &&
        draft.senderPublicKey.length === 56 &&
        accountExists === true &&
        balances.some((balance) => balance.assetCode === draft.assetCode && (balance.assetIssuer ?? '') === draft.assetIssuer) &&
        isStellarAmount(draft.amountPerLink) &&
        receiveAsError === null
      )
    }
    if (wizard.step === 1) {
      return (
        draft.linkCount >= 1 &&
        draft.linkCount <= config.maxLinksPerCampaign &&
        expiryError(draft.expiresAt, expiryNow) === null &&
        labelError === null &&
        affordable !== null && affordable.asset && affordable.reserve &&
        cost !== null
      )
    }
    return false
  }, [wizard.step, draft, expiryNow, accountExists, balances, config.maxLinksPerCampaign, labelError, cost, affordable, receiveAsError])

  return (
    <div className="mt-2xl grid grid-cols-[240px_1fr] gap-2xl max-lg:grid-cols-1">
      {template && (
        <div className="mb-lg rounded-lg border border-outline-variant/50 bg-surface-container p-md lg:col-span-2" data-testid="template-banner">
          <p className="text-label-md font-semibold text-on-surface">
            {template.draftCampaignId ? `Prepared run of “${template.templateName}”` : `From template “${template.templateName}”`}
          </p>
          <p className="mt-1 text-body-md text-on-surface-variant">
            {template.draftCampaignId
              ? 'The campaign exists in draft with the template’s terms and recipients. What is left is what only you can do: generate the keys in this tab, save the secrets file, and sign — nothing has moved.'
              : 'The terms and the recipient list are filled in from the template. Keys are generated fresh here, as for any campaign, and the secrets file must be saved before signing.'}
          </p>
        </div>
      )}
      {reissue && (
        // Both columns: as a plain child it would take the sidebar cell and push the stepper over.
        <div className="mb-lg rounded-lg border border-outline-variant/50 bg-surface-container p-md lg:col-span-2">
          <p className="text-label-md font-semibold text-on-surface">Renewing {reissue.outstanding} returned {reissue.outstanding === 1 ? 'link' : 'links'} of “{reissue.name}”</p>
          <p className="mt-1 text-body-md text-on-surface-variant">
            The original unused funds have been reclaimed. This linked round uses exactly {reissue.budget} {reissue.assetCode} returned to the same sender, with fresh links and an expiry you choose. The original links have expired. Already claimed funds are excluded. Save a new CSV and distribute only the replacement links.
          </p>
        </div>
      )}
      <Stepper steps={summarise(STEPS, draft, cost, amounts.some((a) => a !== null))} current={wizard.step} />

      <fieldset disabled={!hydrated} aria-busy={!hydrated} data-testid="wizard-interactive" className="min-w-0">
        {/*
          * A prepared run (#82): the draft's terms and list are fixed — the
          * link count, policy, sender and asset are already the campaign's
          * and the server would refuse anything else at registration or
          * signing. Every field in both steps is disabled; the banner says why.
          */}
        <fieldset disabled={locked || !!reissue?.draftCampaignId || (reissue !== null && wizard.step === 0)} className="contents" data-testid={locked ? 'terms-locked' : undefined}>
        {wizard.step === 0 && (
          <AssetStep
            networkWorkspaces={config.networkWorkspaces}
            lookupFailed={complete && fresh && accountExists === null}
            onRetryBalance={() => { setLookup({ key: '', exists: null, balances: EMPTY_BALANCES }); setLookupVersion((version) => version + 1) }}
            stellar={config.stellar}
            draft={draft}
            onChange={patch}
            onConnect={reissue || template ? undefined : async () => {
              try { patch({ senderPublicKey: await connectWallet(draft.network) }); wizard.setError(null) }
              catch (error) { wizard.setError(await walletErrorMessage(error)) }
            }}
            balances={balances}
            accountExists={accountExists}
            checking={checking}
            receiveAsRaw={receiveAsRaw}
            receiveAsError={receiveAsError}
            onReceiveAs={onReceiveAs}
            allowExchangeDeposit={allowExchangeDeposit}
            onAllowExchangeDeposit={setAllowExchangeDeposit}
            emailReceipts={emailReceipts}
            onEmailReceipts={setEmailReceipts}
          />
        )}
        {wizard.step === 1 && (
          <RecipientsStep
            draft={draft}
            expiryChoice={expiryChoice}
            expiryError={expiryError(draft.expiresAt, expiryNow)}
            onExpiry={(value, choice) => {
              patch({ expiresAt: value })
              setExpiryChoice(choice)
              setExpiryNow(Date.now())
            }}
            labelsDefault={recipientsCsv}
            onChange={patch}
            labels={labels}
            amounts={amounts}
            defaultAmount={draft.amountPerLink}
            assetCode={draft.assetCode}
            onAmount={onAmount}
            onResetAmounts={onResetAmounts}
            labelError={labelError}
            onLabels={onLabels}
            claimPolicy={claimPolicy}
            onClaimPolicy={setClaimPolicy}
            reminderDays={reminderDays}
            onReminderDays={setReminderDays}
            cost={cost}
            reserveSource={sponsored ? sponsoredReservePerLink : reservePerLink}
            maxLinks={config.maxLinksPerCampaign}
            maxOpsPerBatch={config.maxOpsPerBatch - (sponsored ? 2 : 0)}
            affordable={affordable}
            renewal={reissue !== null}
          />
        )}
        </fieldset>
        {wizard.step === 2 && stepUp.panel}
        {wizard.step === 2 && (
          <p className="mb-md text-body-md text-on-surface-variant" role="status">
            {config.stellar.networkLabel} · {config.stellar.valueNotice} Expiry: {expiryDescription(draft.expiresAt)}
          </p>
        )}
        {wizard.step === 2 && amounts.some((amount) => amount !== null) && (
          <div className="mb-md">
            <PrizeAmounts count={draft.linkCount} labels={labels} amounts={amounts} defaultAmount={draft.amountPerLink} assetCode={draft.assetCode} onAmount={() => undefined} onReset={() => undefined} readOnly />
          </div>
        )}
        {wizard.step === 2 && (
          <ExportStep
            phase={wizard.phase}
            linkCount={draft.linkCount}
            keys={wizard.keys}
            downloaded={wizard.downloaded}
            exportConfirmed={wizard.exportConfirmed}
            onConfirmExport={wizard.confirmExport}
            filename={filename}
            cost={cost}
            progress={wizard.progress}
            error={wizard.error}
            onGenerate={onGenerate}
            onDownload={onDownload}
            onSign={() => void onSign()}
            onFinish={onFinish}
            campaignId={wizard.campaignId}
            appUrl={config.appUrl}
            screening={config.screening}
            phraseConfirmed={phraseConfirmed}
            onPhrase={onPhrase}
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
              onClick={() => {
                setExpiryNow(Date.now())
                if (wizard.step === 1 && expiryError(draft.expiresAt)) return
                wizard.setStep(wizard.step + 1)
              }}
            >
              Continue
            </Button>
          )}
        </div>
      </fieldset>
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
  derivation: { index: number; fingerprint: string } | null,
  claimPolicy: 'open' | 'code' | 'email' | 'passkey' = 'open',
  reminderDaysBefore: number[] = [],
  receiveAs: ReceiveAsEntry[] = [],
  allowExchangeDeposit = false,
  templateId: string | null = null,
  emailReceipts = false,
  recipientsCsv = '',
  renewalOfId: string | null = null,
): Promise<string> {
  const response = await fetch('/api/campaigns', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey() },
    body: JSON.stringify({
      name: draft.name,
      ...(renewalOfId ? { renewalOfId } : {}),
      network: draft.network,
      senderPublicKey: draft.senderPublicKey,
      assetCode: draft.assetCode,
      assetIssuer: draft.assetIssuer === '' ? undefined : draft.assetIssuer,
      amountPerLink: draft.amountPerLink,
      linkCount,
      expiresAt: new Date(draft.expiresAt).toISOString(),
      // The path index and a PUBLIC-key fingerprint (#77). Never the phrase.
      ...(derivation ? { derivationIndex: derivation.index, keyFingerprint: derivation.fingerprint } : {}),
      ...(claimPolicy !== 'open' ? { claimPolicy } : {}),
      ...(reminderDaysBefore.length > 0 ? { reminderDaysBefore } : {}),
      // Omitted entirely when empty, so the request is what it always was.
      ...(receiveAs.length > 0 ? { receiveAs } : {}),
      ...(allowExchangeDeposit ? { allowExchangeDeposit } : {}),
      // A campaign from a template (#82) is recorded as a manual run of it.
      ...(templateId ? { templateId, recipientsCsv } : {}),
      ...(emailReceipts ? { emailReceipts } : {}),
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

/**
 * The server refused to hand over an envelope — a screening hold or block,
 * a missing approval, an unfunded sender. Its `detail` is written for the
 * sender and is shown as-is; nothing about it is a wallet error.
 */
class PrepareRefused extends Error {}

async function prepareBatch(campaignId: string): Promise<{ sequence: number; xdr: string } | null> {
  const response = await fetch(`/api/campaigns/${campaignId}/batches/prepare`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (response.status === 409) throw new PrepareRefused((await problemDetail(response)) ?? 'This campaign cannot be signed right now.')
  if (!response.ok) throw new PrepareRefused((await problemDetail(response)) ?? 'The batch could not be prepared. No new signing request was made.')
  const body = await response.json()
  return { sequence: body.sequence, xdr: body.xdr }
}

/** Do not request another sequence while the preceding payment is uncertain. */
async function waitForBatchConfirmation(campaignId: string, sequence: number): Promise<void> {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    const response = await fetch(`/api/campaigns/${campaignId}/batches`, { cache: 'no-store' })
    if (!response.ok) throw new Error('The batch was submitted, but its status could not be checked. Keep your CSV and check the campaign before retrying.')
    const body = await response.json() as { batches: { sequence: number; status: string; errorCode: string | null }[] }
    const batch = body.batches.find((b) => b.sequence === sequence)
    if (batch?.status === 'CONFIRMED') return
    if (batch?.status === 'FAILED') throw new Error(`The network rejected batch ${sequence}: ${batch.errorCode ?? 'transaction failed'}. Earlier funded links are preserved.`)
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  throw new Error('The batch is still awaiting ledger confirmation. Keep your CSV and check the campaign before retrying or sharing links.')
}

async function problemDetail(response: Response): Promise<string | null> {
  const body = await response.json().catch(() => null)
  return body?.detail ?? body?.errors?.[0]?.message ?? null
}

/* ── helpers ───────────────────────────────────────────────────────────── */

function defaultExpiry(): string {
  return presetExpiry('30d')
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
    case 'too-long':
      return `Line ${parsed.line}: the ${parsed.column} column is over ${parsed.allowed} characters.`
    case 'amount':
      return `Line ${parsed.line}: the prize amount is invalid. Use a positive amount within the Stellar limit, with up to seven decimal places, or leave the cell blank for the default.`
    case 'empty':
      return 'No labels found.'
  }
}

function summarise(
  steps: { title: string }[],
  draft: { assetCode: string; amountPerLink: string; linkCount: number },
  cost: CostBreakdown | null,
  amountsVary = false,
) {
  return steps.map((step, index) => ({
    ...step,
    summary:
      index === 0 && draft.amountPerLink
        ? `${draft.amountPerLink} ${draft.assetCode} per link${cost && amountsVary ? ` by default · ${cost.totalAmount} in total` : ''}`
        : index === 1 && cost
          ? `${draft.linkCount} links · ${cost.signatures} signature${cost.signatures === 1 ? '' : 's'}`
          : undefined,
  }))
}
