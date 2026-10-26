'use client'

import Decimal from 'decimal.js'
import { Button, Input, MetricCard, SolidCard } from '@/components/ui'
import type { CostBreakdown } from '@/lib/campaign/cost'
import type { stellarMetadata } from '@/lib/stellar/network'
import { ExpiryPicker } from './expiry-picker'
import { isStellarAmount, MAX_STELLAR_AMOUNT } from '@/lib/stellar/amount'
import { EmailRecipients } from './email-recipients'
import { WalletRecipients } from './wallet-recipients'
import { PrizeAmounts } from './prize-amounts'
import { NetworkPicker } from './network-picker'
import { useSyncExternalStore } from 'react'
import { lanternSnapshot, subscribeLantern } from '@/lib/wallet/lantern'
import { phoneBrowserSnapshot, subscribePhoneBrowser } from '@/lib/wallet/phone'

/** Step 1 — asset and amount. SPEC.md §5.3. */
export function AssetStep({
  stellar,
  networkWorkspaces,
  lookupFailed = false,
  onRetryBalance,
  draft,
  onChange,
  onConnect,
  balances,
  accountExists,
  checking,
  receiveAsRaw,
  receiveAsError,
  onReceiveAs,
  allowExchangeDeposit,
  onAllowExchangeDeposit,
  emailReceipts,
  onEmailReceipts,
}: {
  stellar: ReturnType<typeof stellarMetadata>
  networkWorkspaces?: import('@/lib/stellar/network-workspaces').NetworkWorkspaces
  lookupFailed?: boolean
  onRetryBalance?: () => void
  onConnect?: () => void
  draft: { network: 'testnet' | 'public'; senderPublicKey: string; assetCode: string; assetIssuer: string; amountPerLink: string; name: string }
  onChange: (patch: Partial<typeof draft>) => void
  balances: { assetCode: string; assetIssuer: string | null; balance: string }[]
  accountExists: boolean | null
  checking: boolean
  /** Receive-as (#74): what the sender typed, and what was wrong with it. */
  receiveAsRaw: string
  receiveAsError: string | null
  onReceiveAs: (raw: string) => void
  /** Exchange deposit (#75): may recipients claim to an address plus a memo? */
  allowExchangeDeposit: boolean
  onAllowExchangeDeposit: (allow: boolean) => void
  /** Signed receipts (#81): email each recipient theirs when they claim. */
  emailReceipts: boolean
  onEmailReceipts: (send: boolean) => void
}) {
  const inLantern = useSyncExternalStore(subscribeLantern, lanternSnapshot, () => false)
  const phoneBrowser = useSyncExternalStore(subscribePhoneBrowser, phoneBrowserSnapshot, () => false)
  const native = balances.find((b) => b.assetIssuer === null)
  const usdc = stellar.defaultAsset
  const selectableBalances = balances.filter((b) => b.assetCode !== 'USDC' || b.assetIssuer === usdc.assetIssuer)
  const holdsUsdc = selectableBalances.some((b) => b.assetCode === usdc.assetCode && b.assetIssuer === usdc.assetIssuer)

  return (
    <SolidCard>
      <h2 className="text-headline-sm text-on-surface">Asset &amp; amount</h2>

      <div className="mt-lg flex flex-col gap-md">
        <Input
          label="Campaign name"
          name="name"
          value={draft.name}
          maxLength={80}
          onChange={(e) => onChange({ name: e.target.value })}
          helper="Only you see this. It names the export file."
          required
        />

        <NetworkPicker network={stellar.network} workspaces={networkWorkspaces} />

        <Input
          label="Funding account"
          name="senderPublicKey"
          value={draft.senderPublicKey}
          onChange={(e) => onChange({ senderPublicKey: e.target.value.trim() })}
          helper={
            lookupFailed ? 'Balance check unavailable. Retry before choosing prizes.' : checking
              ? 'Checking…'
              : accountExists === false
                ? 'This account does not exist on the selected network yet.'
                : native
                  ? `${new Decimal(native.balance).toFixed()} XLM available`
                  : 'The G… address that funds this campaign.'
          }
          error={accountExists === false ? 'Fund this account, or choose another.' : undefined}
          spellCheck={false}
          autoComplete="off"
          required
        />
        {onConnect && <Button variant="secondary" onClick={onConnect} data-testid="sender-connect-wallet">{inLantern ? 'Connect Lantern' : phoneBrowser ? 'Connect Freighter on phone' : 'Connect Freighter'}</Button>}
        <p className="text-body-md text-on-surface-variant" data-testid="funding-address-guidance">Connect to use your wallet address, or enter it above to check its balance. Funding and reclaim still need approval from that account&apos;s wallet.</p>
        {lookupFailed && onRetryBalance && <Button variant="secondary" onClick={onRetryBalance}>Retry balance check</Button>}

        <div className="flex flex-col gap-xs">
          <label
            htmlFor="asset"
            className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant"
          >
            Asset
          </label>
          <select
            id="asset"
            name="asset"
            value={`${draft.assetCode}:${draft.assetIssuer}`}
            onChange={(e) => {
              const [assetCode, assetIssuer = ''] = e.target.value.split(':')
              if (!assetCode) return
              onChange({ assetCode, assetIssuer })
            }}
            className="min-h-11 rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface"
          >
            {!holdsUsdc && <option value={`USDC:${usdc.assetIssuer}`}>USDC — unavailable in this account</option>}
            {selectableBalances.map((balance) => (
              <option
                key={`${balance.assetCode}:${balance.assetIssuer ?? ''}`}
                value={`${balance.assetCode}:${balance.assetIssuer ?? ''}`}
              >
                {balance.assetCode} — {new Decimal(balance.balance).toFixed()} available
              </option>
            ))}
          </select>
          <p className="font-mono text-label-sm text-on-surface-variant">
            USDC uses the official Circle issuer for this network. Your account needs the selected asset to fund a campaign.
          </p>
        </div>

        <Input
          label="Amount per link"
          name="amountPerLink"
          value={draft.amountPerLink}
          inputMode="decimal"
          onChange={(e) => onChange({ amountPerLink: e.target.value })}
          helper="Choose any prize your available balance can cover, up to 7 decimal places. Set individual prizes in Recipients & expiry."
          error={draft.amountPerLink !== '' && !isStellarAmount(draft.amountPerLink) ? `Enter a positive amount with up to 7 decimal places, at most ${MAX_STELLAR_AMOUNT}.` : undefined}
          required
        />

        <div className="flex flex-col gap-xs">
          <label
            htmlFor="receiveAs"
            className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant"
          >
            Let recipients receive as (optional)
          </label>
          <textarea
            id="receiveAs"
            name="receiveAs"
            rows={2}
            value={receiveAsRaw}
            onChange={(e) => onReceiveAs(e.target.value)}
            placeholder={'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'}
            spellCheck={false}
            className="rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface"
          />
          <p className="font-mono text-label-sm text-on-surface-variant">
            One per line: XLM, or CODE:issuer. Each recipient may convert into one of these when they
            claim, at a live price with a floor — if no market exists at that moment, they receive{' '}
            {draft.assetCode} as sent. Leave empty to offer no conversion.
          </p>
          {receiveAsError && (
            <p role="alert" className="font-mono text-label-sm text-error">
              {receiveAsError}
            </p>
          )}
        </div>

        <label className="flex items-start gap-sm">
          <input
            type="checkbox"
            name="allowExchangeDeposit"
            checked={allowExchangeDeposit}
            onChange={(e) => onAllowExchangeDeposit(e.target.checked)}
            className="mt-1 h-5 w-5"
          />
          <span className="flex flex-col gap-xs">
            <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
              Allow claiming to an exchange account
            </span>
            <span className="font-mono text-label-sm text-on-surface-variant">
              Recipients may enter a deposit address and memo instead of connecting a wallet. Kleym requires
              and checks the memo before signing, and warns that a wrong one cannot be undone.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-sm">
          <input
            type="checkbox"
            name="emailReceipts"
            checked={emailReceipts}
            onChange={(e) => onEmailReceipts(e.target.checked)}
            className="mt-1 h-5 w-5"
          />
          <span className="flex flex-col gap-xs">
            <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
              Email each recipient a signed receipt when they claim
            </span>
            <span className="font-mono text-label-sm text-on-surface-variant">
              Recipients assigned an email for verification can receive one. The receipt names the wallet that claimed,
              the amount, the time and the transaction — never the link — and verifies with Kleym’s public key alone.
              Every claim gets a receipt you can download regardless.
            </span>
          </span>
        </label>
      </div>
    </SolidCard>
  )
}

/** Step 2 — recipients, expiry, and what it costs. SPEC.md §5.3. */
export function RecipientsStep({
  draft,
  onChange,
  labels,
  labelsDefault = '',
  amounts,
  defaultAmount,
  assetCode,
  onAmount,
  onResetAmounts,
  labelError,
  onLabels,
  reminderDays,
  onReminderDays,
  reminderAvailable = false,
  claimPolicy,
  onClaimPolicy,
  wallets = [], onWalletImport, onWalletPending,
  emails = [], onEmailImport, emailAvailable = false,
  cost,
  reserveSource,
  maxLinks,
  maxOpsPerBatch,
  affordable,
  renewal = false,
  expiryChoice,
  expiryError,
  onExpiry,
}: {
  draft: { linkCount: number; expiresAt: string }
  renewal?: boolean
  expiryChoice: import('@/lib/campaign/expiry').ExpiryChoice
  expiryError: string | null
  onExpiry: (value: string, choice: import('@/lib/campaign/expiry').ExpiryChoice) => void
  onChange: (patch: Partial<typeof draft>) => void
  labels: string[]
  /** Per-link amounts from the editor or CSV; null entries take the default. */
  amounts: (string | null)[]
  defaultAmount: string
  assetCode: string
  onAmount: (index: number, value: string) => void
  onResetAmounts: () => void
  labelError: string | null
  onLabels: (raw: string) => void
  /** A template's recipient list (#82), as the field's initial text. */
  labelsDefault?: string
  /** Reminder points (#78), days before expiry. */
  reminderDays: number[]
  onReminderDays: (days: number[]) => void
  reminderAvailable?: boolean
  /** Who may claim (#79). */
  emails?: string[]
  emailAvailable?: boolean
  onEmailImport: (rows: import('@/lib/campaign/email-recipients').EmailRecipients) => void
  wallets?: string[]
  onWalletImport: (rows: import('@/lib/campaign/wallet-recipients').WalletRecipients) => void
  onWalletPending: (error: string | null) => void
  claimPolicy: 'open' | 'code' | 'email' | 'passkey' | 'wallet'
  onClaimPolicy: (policy: 'open' | 'code' | 'email' | 'passkey' | 'wallet') => void
  cost: CostBreakdown | null
  reserveSource: string | null
  maxLinks: number
  maxOpsPerBatch: number
  affordable: { asset: boolean; reserve: boolean } | null
}) {
  return (
    <SolidCard>
      <h2 className="text-headline-sm text-on-surface">Recipients &amp; expiry</h2>

      <div className="mt-lg flex flex-col gap-md">
        <fieldset className="flex flex-col gap-xs">
          <legend className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
            Who may claim
          </legend>
          {(
            [
              ['open', 'Anyone with the link', 'The link is the credential. Right for most distributions; a leaked link is claimable by whoever holds it.'],
              ['code', 'Anyone with the link AND a claim code', 'Kleym requires each link’s separate 13-character code before processing a claim. The code is included in your private CSV. Send it through a separate channel. This is a Kleym check, not an extra Stellar signing requirement: keep the link private too.'],
              ['wallet', 'Only the assigned wallet address', 'Import a CSV of recipient wallets. Each link is locked on Stellar to its assigned wallet; a leaked link cannot send the prize to a different wallet.'],
              ['email', emailAvailable ? 'Anyone with the link AND email verification' : 'Email verification (unavailable here)', emailAvailable ? 'Assign recipient emails by CSV. The recipient must enter a six-digit code sent through Zender. Keep claim links private; this is a Kleym check, not an on-chain wallet lock.' : 'Available for new campaigns after Zender is configured. Reusable email-recipient templates are not supported.'],
              ['passkey', 'First-device passkey verification', 'The first recipient registers a passkey for Kleym to verify on that device. This is a Kleym check, not an extra Stellar signing requirement. Keep the private link safe; use assigned-wallet claims for an on-chain wallet lock.'],
            ] as const
          ).map(([value, title, detail]) => (
            <label key={value} className="flex items-start gap-sm rounded-lg border border-outline-variant/50 bg-surface-container-low p-md">
              <input
                type="radio"
                name="claimPolicy"
                value={value}
                checked={claimPolicy === value}
                disabled={value === 'email' && !emailAvailable}
                onChange={() => onClaimPolicy(value)}
                className="mt-1 h-5 w-5"
              />
              <span className="flex flex-col gap-xs">
                <span className="text-label-md font-semibold text-on-surface">{title}</span>
                <span className="font-mono text-label-sm text-on-surface-variant">{detail}</span>
              </span>
            </label>
          ))}
          <p className="font-mono text-label-sm text-on-surface-variant">
            Wallet addresses identify accounts, not people. Other policies bind a link to a channel or device.
          </p>
        </fieldset>

        {claimPolicy === 'email' && <EmailRecipients count={draft.linkCount} maxLinks={maxLinks} onImport={onEmailImport} onPending={onWalletPending} />}
        {claimPolicy === 'wallet' && <WalletRecipients count={draft.linkCount} maxLinks={maxLinks} onImport={onWalletImport} onPending={onWalletPending} />}

        <Input
          label="Number of links"
          name="linkCount"
          disabled={renewal || claimPolicy === 'wallet' || claimPolicy === 'email'}
          type="number"
          min={1}
          max={maxLinks}
          value={String(draft.linkCount)}
          onChange={(e) => onChange({ linkCount: Number(e.target.value) })}
          helper={`Max ${maxLinks.toLocaleString()} per campaign · ${maxOpsPerBatch} links per signature`}
          required
        />

        <ExpiryPicker value={draft.expiresAt} choice={expiryChoice} error={expiryError} onChange={onExpiry} />

        {claimPolicy !== 'wallet' && claimPolicy !== 'email' && <div className="flex flex-col gap-xs">
          <label
            htmlFor="labels"
            className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant"
          >
            Labels (optional)
          </label>
          <textarea
            id="labels"
            name="labels"
            rows={4}
            value={labelsDefault}
            onChange={(e) => onLabels(e.target.value)}
            placeholder={'alice\nbob\ncarol'}
            className="rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface"
          />
          <p className="font-mono text-label-sm text-on-surface-variant">
            Your own notes, one per line — a name or a handle. Never recipient addresses:
            each link is claimed by whoever opens it, so there is no address to record.
            To attach your own reference data, paste a CSV with a header row naming any of{' '}
            <span className="text-on-surface">label, reference, category, note</span>; other columns are ignored.
            Use Prize amounts below to set individual prizes, or import an <span className="text-on-surface">amount</span> column.
            A blank amount uses the default. Importing a CSV amount column replaces the current individual amounts.
          </p>
          {labelError && (
            <p role="alert" className="font-mono text-label-sm text-error">
              {labelError}
            </p>
          )}
          {labels.length > 0 && !labelError && (
            <p role="status" className="font-mono text-label-sm text-on-surface-variant">
              {labels.length} label{labels.length === 1 ? '' : 's'} accepted
              {amounts.some((a) => a !== null) && (
                <>, {amounts.filter((a) => a !== null).length} with their own amount</>
              )}.
            </p>
          )}
        </div>}

        <PrizeAmounts wallets={claimPolicy === 'wallet' ? wallets : claimPolicy === 'email' ? emails : undefined} count={draft.linkCount} labels={labels} amounts={amounts} defaultAmount={defaultAmount} assetCode={assetCode} onAmount={onAmount} onReset={onResetAmounts} disabled={renewal} />



        {reminderAvailable && claimPolicy !== 'email' ? <fieldset className="flex flex-col gap-xs">
          <legend className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
            Remind by email (optional)
          </legend>
          <div className="flex flex-wrap gap-md">
            {[14, 7, 3, 1].map((days) => (
              <label key={days} className="flex items-center gap-xs font-mono text-label-md text-on-surface">
                <input
                  type="checkbox"
                  name="reminderDays"
                  className="h-5 w-5"
                  checked={reminderDays.includes(days)}
                  onChange={(e) => onReminderDays(e.target.checked ? [...reminderDays, days] : reminderDays.filter((d) => d !== days))}
                />
                {days} {days === 1 ? 'day' : 'days'} before expiry
              </label>
            ))}
          </div>
          <p className="font-mono text-label-sm text-on-surface-variant">
            <>Only recipients you deliver to by email can be reminded, and a reminder never repeats the link — Kleym does
            not keep it. It names you, the amount and the expiry, and points at the original message. One email per
            address per day at most.</>
          </p>
        </fieldset> : <p className="font-mono text-label-sm text-on-surface-variant">Share each claim link privately from your saved CSV and tell the recipient its deadline. New campaigns do not send email invitations or expiry reminders; email verification sends a code only when the recipient requests it.</p>}
      </div>

      {cost && (
        <div className="mt-xl grid grid-cols-2 gap-md max-md:grid-cols-1">
          <MetricCard label="Total to send" value={cost.totalAmount} icon="redeem" />
          <MetricCard label="Reserve locked" value={`${cost.totalReserve} XLM`} icon="toll" />
          <MetricCard label="Fees" value={`${cost.totalFee} XLM`} icon="trending_up" />
          <MetricCard label="Signatures" value={`${cost.signatures}`} icon="verified_user" />
        </div>
      )}

      {reserveSource && (
        <p className="mt-md font-mono text-label-sm text-on-surface-variant">
          Reserve is {reserveSource} XLM per link, read from the network just now — it is a
          protocol value and can change. {cost?.sponsored ? 'Kleym pays this reserve and the network fees. You supply only the USDC.' : 'It returns to you when a link is claimed or reclaimed.'}
        </p>
      )}

      {affordable && !affordable.asset && (
        <p role="alert" className="mt-md font-mono text-label-sm text-error">
          This account does not hold enough of that asset.
        </p>
      )}
      {affordable && !affordable.reserve && (
        <p role="alert" className="mt-md font-mono text-label-sm text-error">
          Not enough XLM for the reserve and fees. The reserve is XLM even when the asset is not.
        </p>
      )}
    </SolidCard>
  )
}
