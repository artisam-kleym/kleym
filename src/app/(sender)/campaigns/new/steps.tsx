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
}: {
  draft: { network: 'testnet' | 'public'; senderPublicKey: string; assetCode: string; assetIssuer: string; amountPerLink: string; name: string }
  onChange: (patch: Partial<typeof draft>) => void
  balances: { assetCode: string; assetIssuer: string | null; balance: string }[]
  accountExists: boolean | null
  checking: boolean
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
      </div>
    </SolidCard>
  )
}

/** Step 2 — recipients, expiry, and what it costs. SPEC.md §5.3. */
export function RecipientsStep({
  draft,
  onChange,
  labels,
  labelError,
  onLabels,
  reminderDays,
  onReminderDays,
  cost,
  reserveSource,
  maxLinks,
  maxOpsPerBatch,
  affordable,
}: {
  draft: { linkCount: number; expiresAt: string }
  onChange: (patch: Partial<typeof draft>) => void
  labels: string[]
  labelError: string | null
  onLabels: (raw: string) => void
  /** Reminder points (#78), days before expiry. */
  reminderDays: number[]
  onReminderDays: (days: number[]) => void
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
            onChange={(e) => onLabels(e.target.value)}
            placeholder={'alice\nbob\ncarol'}
            className="rounded-lg border border-outline bg-surface-container-low px-4 py-3 font-mono text-label-md text-on-surface"
          />
          <p className="font-mono text-label-sm text-on-surface-variant">
            Your own notes, one per line — a name or a handle. Never recipient addresses:
            each link is claimed by whoever opens it, so there is no address to record.
            To attach your own reference data, paste a CSV with a header row naming any of{' '}
            <span className="text-on-surface">label, reference, category, note</span>; other columns are ignored.
          </p>
          {labelError && (
            <p role="alert" className="font-mono text-label-sm text-error">
              {labelError}
            </p>
          )}
          {labels.length > 0 && !labelError && (
            <p role="status" className="font-mono text-label-sm text-on-surface-variant">
              {labels.length} label{labels.length === 1 ? '' : 's'} accepted.
            </p>
          )}
        </div>

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
