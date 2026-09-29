'use client'

import Decimal from 'decimal.js'
import { Input, MetricCard, SolidCard } from '@/components/ui'
import type { CostBreakdown } from '@/lib/campaign/cost'

/** Step 1 — asset and amount. SPEC.md §5.3. */
export function AssetStep({
  draft,
  onChange,
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
  const native = balances.find((b) => b.assetIssuer === null)

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

        <div className="flex flex-col gap-xs">
          <label
            htmlFor="network"
            className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant"
          >
            Network
          </label>
          <select
            id="network"
            name="network"
            value={draft.network}
            onChange={(e) => onChange({ network: e.target.value as 'testnet' | 'public' })}
            className="min-h-11 rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface"
          >
            <option value="testnet">Testnet</option>
            <option value="public">Public</option>
          </select>
        </div>

        <Input
          label="Funding account"
          name="senderPublicKey"
          value={draft.senderPublicKey}
          onChange={(e) => onChange({ senderPublicKey: e.target.value.trim() })}
          helper={
            checking
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
              const [assetCode = 'XLM', assetIssuer = ''] = e.target.value.split(':')
              onChange({ assetCode, assetIssuer })
            }}
            className="min-h-11 rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface"
          >
            {balances.length === 0 && <option value="XLM:">XLM</option>}
            {balances.map((balance) => (
              <option
                key={`${balance.assetCode}:${balance.assetIssuer ?? ''}`}
                value={`${balance.assetCode}:${balance.assetIssuer ?? ''}`}
              >
                {balance.assetCode} — {new Decimal(balance.balance).toFixed()} available
              </option>
            ))}
          </select>
          <p className="font-mono text-label-sm text-on-surface-variant">
            Only assets this account already holds. A trustline it does not have cannot be sent.
          </p>
        </div>

        <Input
          label="Amount per link"
          name="amountPerLink"
          value={draft.amountPerLink}
          inputMode="decimal"
          onChange={(e) => onChange({ amountPerLink: e.target.value })}
          helper="Up to 7 decimal places."
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
              Only recipients you deliver to by email have an address. The receipt names the address that claimed,
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
  labelError,
  onLabels,
  reminderDays,
  onReminderDays,
  claimPolicy,
  onClaimPolicy,
  cost,
  reserveSource,
  maxLinks,
  maxOpsPerBatch,
  affordable,
}: {
  draft: { linkCount: number; expiresAt: string }
  onChange: (patch: Partial<typeof draft>) => void
  labels: string[]
  /** Per-link amounts (#73) read from the pasted CSV; null entries take the default. */
  amounts: (string | null)[]
  labelError: string | null
  onLabels: (raw: string) => void
  /** A template's recipient list (#82), as the field's initial text. */
  labelsDefault?: string
  /** Reminder points (#78), days before expiry. */
  reminderDays: number[]
  onReminderDays: (days: number[]) => void
  /** Who may claim (#79). */
  claimPolicy: 'open' | 'code' | 'email' | 'passkey'
  onClaimPolicy: (policy: 'open' | 'code' | 'email' | 'passkey') => void
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
        <Input
          label="Number of links"
          name="linkCount"
          type="number"
          min={1}
          max={maxLinks}
          value={String(draft.linkCount)}
          onChange={(e) => onChange({ linkCount: Number(e.target.value) })}
          helper={`Max ${maxLinks.toLocaleString()} per campaign · ${maxOpsPerBatch} links per signature`}
          required
        />

        <Input
          label="Expires at"
          name="expiresAt"
          type="datetime-local"
          value={draft.expiresAt}
          onChange={(e) => onChange({ expiresAt: e.target.value })}
          helper="Unclaimed funds return to source."
          required
        />

        <div className="flex flex-col gap-xs">
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
            defaultValue={labelsDefault}
            onChange={(e) => onLabels(e.target.value)}
            placeholder={'alice\nbob\ncarol'}
            className="rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface"
          />
          <p className="font-mono text-label-sm text-on-surface-variant">
            Your own notes, one per line — a name or a handle. Never recipient addresses:
            each link is claimed by whoever opens it, so there is no address to record.
            To attach your own reference data, paste a CSV with a header row naming any of{' '}
            <span className="text-on-surface">label, reference, category, note</span>; other columns are ignored.
            To pay different amounts, add an <span className="text-on-surface">amount</span> column —
            a blank cell pays the amount per link above.
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
        </div>

        <fieldset className="flex flex-col gap-xs">
          <legend className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
            Who may claim
          </legend>
          {(
            [
              ['open', 'Anyone with the link', 'The link is the credential. Right for most distributions; a leaked link is claimable by whoever holds it.'],
              ['code', 'Anyone with the link AND a claim code', 'Each link gets a 13-character code, written into your secrets file. Hand it over through a second channel — chat, a call, a card — and a forwarded link is useless without it. The file then holds link and code together, so guard it accordingly.'],
              ['email', 'Only the email address you send it to', 'Links must be delivered by Kleym email; the recipient enters the six-digit code sent to that address. A link you distribute yourself under this policy cannot be claimed.'],
              ['passkey', 'Only the first device that claims', 'The first person to open the link registers a passkey on their device, and only that device can finish the claim. A copy made afterwards is useless.'],
            ] as const
          ).map(([value, title, detail]) => (
            <label key={value} className="flex items-start gap-sm rounded-lg border border-outline-variant/50 bg-surface-container-low p-md">
              <input
                type="radio"
                name="claimPolicy"
                value={value}
                checked={claimPolicy === value}
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
            None of these identifies a person. They bind a link to a channel or a device; recipients stay anonymous.
          </p>
        </fieldset>

        <fieldset className="flex flex-col gap-xs">
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
            Only recipients you deliver to by email can be reminded, and a reminder never repeats the link — Kleym does
            not keep it. It names you, the amount and the expiry, and points at the original message. One email per
            address per day at most.
          </p>
        </fieldset>
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
          protocol value and can change. It returns to you when a link is claimed or reclaimed.
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
