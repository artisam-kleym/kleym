'use client'

/**
 * Wizard state. SPEC.md §5.3.
 *
 * Seeds live in this hook's state and nowhere else — no localStorage, no
 * sessionStorage, no URL. Navigating away loses them, which is the honest
 * behaviour: the server cannot hand them back (AGENT.md §1), and a wizard that
 * quietly kept a copy somewhere recoverable would be lying about that.
 */
import { useCallback, useState } from 'react'
import type { EphemeralKey } from '@/lib/campaign/keygen'
import type { stellarMetadata } from '@/lib/stellar/network'
import type { ReissueSource } from '@/lib/api/outstanding'

export type Phase =
  | 'editing'
  | 'generating'
  | 'awaiting-download'
  | 'batching'
  | 'complete'
  | 'partial'

export interface WizardConfig {
  stellar: ReturnType<typeof stellarMetadata>
  networkWorkspaces?: import('@/lib/stellar/network-workspaces').NetworkWorkspaces
  appUrl: string
  maxOpsPerBatch: number
  maxLinksPerCampaign: number
  baseFeeStroops: string
  /** Whether the organisation screens batches (#52) — copy only; the server decides. */
  screening: boolean
  emailVerificationAvailable?: boolean
  /** Historical Testnet email harness only; production distributes links locally. */
  legacyEmailDeliveryAvailable?: boolean
  /**
   * Reissue (#78): the campaign this one replaces the unclaimed links of. The
   * terms are prefilled; the expiry is not — that is the point of a reissue.
   */
  reissue?: ReissueSource | null
  /**
   * Template (#82): terms and recipient list prefilled; this campaign is a
   * MANUAL run of it. Or a PREPARED run: the campaign already exists in
   * DRAFT (a schedule or "Run now" made it) and only keys are missing — the
   * terms are the draft's and cannot change here.
   */
  template?: TemplatePrefill | null
}

export interface TemplatePrefill {
  templateId: string
  templateName: string
  /** Set when a DRAFT campaign already exists for this run; the wizard registers links to it instead of creating one. */
  draftCampaignId: string | null
  name: string
  network: 'testnet' | 'public'
  senderPublicKey: string
  assetCode: string
  assetIssuer: string | null
  amountPerLink: string
  expiresAt: string
  claimPolicy: 'open' | 'code' | 'email' | 'passkey' | 'wallet'
  reminderDaysBefore: number[]
  /** One per line, `XLM` or `CODE:ISSUER` — the raw the receive-as field takes. */
  receiveAsRaw: string
  allowExchangeDeposit: boolean
  recipientsCsv: string
  linkCount: number
}

export interface DraftCampaign {
  name: string
  network: 'testnet' | 'public'
  senderPublicKey: string
  assetCode: string
  assetIssuer: string | null
  amountPerLink: string
  linkCount: number
  expiresAt: string
}

export interface BatchProgress {
  signed: number
  total: number
  failed: number
}

export function useWizard() {
  const [step, setStep] = useState(0)
  const [phase, setPhase] = useState<Phase>('editing')
  const [keys, setKeys] = useState<EphemeralKey[]>([])

  /*
   * THE GATE. SPEC.md §10.11.
   *
   * Set by exactly one caller — the download handler, after the browser has
   * been handed the file. Nothing else may set it, and step 4 is unreachable
   * while it is false. A boolean rather than a click count: a click that threw
   * before the Blob was written must not open the gate.
   */
  const [downloaded, setDownloaded] = useState(false)
  const [exportConfirmed, setExportConfirmed] = useState(false)

  const [progress, setProgress] = useState<BatchProgress>({ signed: 0, total: 0, failed: 0 })
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const markDownloaded = useCallback(() => setDownloaded(true), [])
  const confirmExport = useCallback((confirmed: boolean) => {
    setExportConfirmed(downloaded && confirmed)
  }, [downloaded])

  /** Regenerating invalidates any earlier download — those keys are gone. */
  const replaceKeys = useCallback((next: EphemeralKey[]) => {
    setKeys(next)
    setDownloaded(false)
    setExportConfirmed(false)
  }, [])

  return {
    step, setStep,
    phase, setPhase,
    keys, replaceKeys,
    downloaded, markDownloaded, exportConfirmed, confirmExport,
    progress, setProgress,
    campaignId, setCampaignId,
    error, setError,
  }
}

/** Step 4 is reachable only from here. */
export function canContinuePastExport(downloaded: boolean, keys: EphemeralKey[], exportConfirmed = false): boolean {
  return downloaded && exportConfirmed && keys.length > 0
}
