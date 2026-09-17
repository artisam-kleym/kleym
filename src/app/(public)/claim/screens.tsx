'use client'

/**
 * A designed screen for every state in SPEC.md §5.1.
 *
 * VOICE — BRAND.md §8, and it matters more here than anywhere else in the
 * product. The audience may never have used Stellar and did not choose to be
 * here; someone sent them a link. So: no "crypto", "web3", "dApp", "protocol"
 * or "non-custodial" in anything a recipient reads. No exclamation marks —
 * "Claimed", not "Success!". Errors name the fix and say the funds are safe,
 * because the first thing a person fears is that they just lost the money.
 */
import { useState, type ReactNode } from 'react'
import { StrKey } from '@stellar/stellar-sdk'
import { Button, Icon, StellarAddress } from '@/components/ui'
import type { ClaimState } from '@/lib/claim/machine'
import { MEMO_TYPES, checkMemo, type DepositMemo, type MemoType } from '@/lib/stellar/memo'

export interface LinkDetails {
  amount: string
  assetCode: string
  senderName: string
  expiresAt: string
  network: string
  /** Who may claim (#79), told before the recipient commits to anything. */
  policy: 'open' | 'code' | 'email' | 'passkey'
  /** PASSKEY policy: whether a device has already been bound to this link. */
  passkeyBound?: boolean
  /** Receive-as (#74): what the sender lets this recipient convert into. Empty when not offered. */
  receiveAs: ReceiveAsOption[]
  /** Exchange deposit (#75): may this recipient claim to an address plus a memo? */
  exchangeDeposit: boolean
}

/** Exchange deposit (#75): where the funds go instead of a connected wallet. */
export interface Deposit {
  publicKey: string
  memo: DepositMemo
}

/** What each policy means for the person reading, in their words. */
export const POLICY_COPY: Record<LinkDetails['policy'], string> = {
  open: 'Anyone who has this link can claim it — keep it to yourself.',
  code: 'This link is bound to a claim code the sender gave you separately. You will be asked for it.',
  email: 'This link was sent to an email address and can only be claimed with the code sent to that address.',
  passkey: 'This link is bound to a passkey. The first time, you register one on this device; after that only that device can claim.',
}

export interface ReceiveAsOption {
  assetCode: string
  assetIssuer: string | null
}

/** A live quote for the chosen asset, from Kleym's own backend — never a third-party widget. */
export type ReceiveAsQuote =
  | { status: 'loading' }
  | { status: 'quoted'; destAmount: string; destMin: string }
  | { status: 'unavailable'; detail: string }

function Centred({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center gap-md text-center">{children}</div>
}

/**
 * A spinner that says what it is waiting for.
 *
 * `role="status"` so a screen reader is told the page changed — the visual
 * spinner is invisible to one, and these states can last several seconds.
 */
function Waiting({ heading, detail }: { heading: string; detail?: string }) {
  return (
    <Centred>
      <div
        aria-hidden="true"
        className="motion-safe:animate-spin h-8 w-8 rounded-[50%] border-2 border-outline-variant border-t-primary"
      />
      <p role="status" className="text-headline-sm text-on-surface">
        {heading}
      </p>
      {detail && <p className="text-body-md text-on-surface-variant">{detail}</p>}
    </Centred>
  )
}

/** The amount, as the one thing the recipient is actually here for. */
function Amount({ amount, assetCode }: { amount: string; assetCode: string }) {
  return (
    <p className="flex items-baseline justify-center gap-2">
      <span className="text-display-lg text-primary">{amount}</span>
      <span className="text-headline-md text-on-surface-variant">{assetCode}</span>
    </p>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function ClaimScreen({
  state,
  link,
  error,
  txHash,
  network,
  claimedAt,
  claimedBy,
  onConnect,
  onRetry,
  otpError,
  onVerifyOtp,
  onResendOtp,
  codeError = null,
  onVerifyCode,
  passkeyError = null,
  onPasskey,
  receiveAs = null,
  quote = null,
  onReceiveAs,
  delivered = null,
  onDeposit,
  lookupFederation,
  depositMade = null,
}: {
  state: ClaimState
  link: LinkDetails | null
  error: string | null
  txHash: string | null
  network: string
  claimedAt: string | null
  claimedBy: string | null
  onConnect: () => void
  onRetry: () => void
  otpError: string | null
  onVerifyOtp: (code: string) => void
  onResendOtp: () => void
  /** CODE policy (#79). */
  codeError?: string | null
  onVerifyCode?: (code: string) => void
  /** PASSKEY policy (#79). */
  passkeyError?: string | null
  onPasskey?: () => void
  /** Receive-as (#74): the asset chosen, null for the one the sender sent. */
  receiveAs?: ReceiveAsOption | null
  quote?: ReceiveAsQuote | null
  onReceiveAs?: (option: ReceiveAsOption | null) => void
  /** What TX2 actually delivered when converting, for the success screen. */
  delivered?: { assetCode: string; destAmount: string; destMin: string } | null
  /** Exchange deposit (#75): claim to this address with this memo instead of a wallet. */
  onDeposit?: (deposit: Deposit) => void
  /** Resolves `name*domain` through Kleym's server. */
  lookupFederation?: (address: string) => Promise<{ accountId: string; memo: DepositMemo | null }>
  /** The deposit that was made, for the success screen. */
  depositMade?: Deposit | null
}) {
  switch (state) {
    case 'loading':
      return <Waiting heading="Resolving the link" />

    case 'invalid':
      return (
        <Centred>
          <Icon name="warning" size={32} className="text-on-surface-variant" />
          <p className="text-headline-sm text-on-surface">This link is not valid</p>
          <p className="text-body-md text-on-surface-variant">
            It may have been mistyped, already used, or passed its expiry date. Ask
            whoever sent it for a new one.
          </p>
        </Centred>
      )

    case 'email_only':
      return (
        <Centred>
          <Icon name="warning" size={32} className="text-on-surface-variant" />
          <p className="text-headline-sm text-on-surface">This link can only be claimed by email</p>
          <p className="text-body-md text-on-surface-variant" data-testid="email-only">
            The sender bound it to an email address, but it was not sent from Kleym. Ask the sender to send it
            to you by email; the message will carry the code that unlocks it.
          </p>
        </Centred>
      )

    case 'ready':
      return (
        <div className="flex flex-col gap-lg">
          <Centred>
            <p className="text-body-md text-on-surface-variant">
              {link?.senderName ? `${link.senderName} sent you` : 'You have received'}
            </p>
            {link && <Amount amount={link.amount} assetCode={link.assetCode} />}
          </Centred>

          {error && (
            // A refused deposit address or memo lands back here with the reason (#75).
            <p role="alert" className="text-center text-body-md text-error" data-testid="ready-error">
              Your funds are untouched. {error}
            </p>
          )}

          {link && (
            <p className="text-center text-body-md text-on-surface-variant" data-testid="claim-policy" data-policy={link.policy}>
              {POLICY_COPY[link.policy]}
            </p>
          )}

          {link && link.receiveAs.length > 0 && onReceiveAs && (
            <ReceiveAsChooser link={link} chosen={receiveAs ?? null} quote={quote ?? null} onChoose={onReceiveAs} />
          )}

          <Button
            variant="claim"
            onClick={onConnect}
            data-testid="claim-connect"
            className="w-full"
            // Not while a price is still being fetched: the button commits to what is shown.
            disabled={quote?.status === 'loading'}
          >
            Connect wallet to claim
          </Button>

          {link?.exchangeDeposit && onDeposit && (
            <DepositForm link={link} onDeposit={onDeposit} lookupFederation={lookupFederation} quoteLoading={quote?.status === 'loading'} />
          )}

          {/*
            BRAND.md §5.2. The panel exists because "connect a wallet" is where
            someone new stops — the fear is that this will cost them something.
          */}
          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-md">
            <p className="text-label-md font-semibold text-on-surface">New to Stellar?</p>
            <p className="mt-1 text-body-md text-on-surface-variant">
              You need a Stellar wallet to receive this. We cover the account setup and
              the network fees, so claiming costs you nothing.
            </p>
          </div>

          {/*
            * SPEC.md §12: a link is a bearer instrument. The person who most
            * needs to know that is the one holding it, on the screen where
            * they are deciding whether to claim now or forward it to someone.
            */}
          <p className="text-center text-body-md text-on-surface-variant">
            Anyone who has this link can claim it. Claim it now rather than passing it on.
          </p>

          {link && (
            <p className="text-center font-mono text-label-sm text-on-surface-variant">
              Available until {formatDate(link.expiresAt)}
            </p>
          )}
        </div>
      )

    case 'otp_required':
      return <OtpPanel error={otpError} onVerify={onVerifyOtp} onResend={onResendOtp} />

    case 'code_required':
      return <CodePanel error={codeError} onVerify={onVerifyCode ?? (() => undefined)} />

    case 'passkey_required':
      return <PasskeyPanel error={passkeyError} bound={link?.passkeyBound === true} onPasskey={onPasskey ?? (() => undefined)} />

    case 'wallet_connecting':
      return <Waiting heading="Waiting for your wallet" detail="Choose an account to continue." />

    case 'materialising':
      return <Waiting heading="Setting up your claim" detail="Approve the first step in your wallet." />

    case 'awaiting_ledger':
      return (
        <Waiting
          heading="Almost there"
          detail="Stellar needs a few seconds to record the first step before the transfer can go through."
        />
      )

    case 'preparing':
      return <Waiting heading="Building your claim" />

    case 'awaiting_signature':
      return <Waiting heading="Confirm in your wallet" detail="One more approval and the funds are yours." />

    case 'submitting':
      return <Waiting heading="Sending to Stellar" />

    case 'claimed_success':
      return (
        <div className="flex flex-col gap-lg">
          <Centred>
            <Icon name="check_circle" size={32} filled className="text-secondary" />
            <p className="text-headline-sm text-on-surface">Claimed</p>
            {depositMade && (
              <p className="text-body-md text-on-surface-variant" data-testid="deposit-made">
                Sent to <span className="font-mono text-on-surface">{depositMade.publicKey.slice(0, 8)}…</span> with memo{' '}
                <span className="font-mono text-on-surface">{depositMade.memo.value}</span> ({depositMade.memo.type}). The
                exchange credits it from that memo — allow a few minutes.
              </p>
            )}
            {delivered ? (
              <>
                <Amount amount={`≥ ${delivered.destMin}`} assetCode={delivered.assetCode} />
                <p className="text-body-md text-on-surface-variant">
                  {link ? `${link.amount} ${link.assetCode} was converted on the way — at least ${delivered.destMin} ${delivered.assetCode} is in your wallet; the exact figure is in the transaction.` : 'The funds are in your wallet.'}
                </p>
              </>
            ) : (
              <>
                {link && <Amount amount={link.amount} assetCode={link.assetCode} />}
                <p className="text-body-md text-on-surface-variant">
                  The funds are in your wallet.
                </p>
              </>
            )}
          </Centred>

          {txHash && (
            <div className="flex flex-col gap-xs">
              <p className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
                Transaction
              </p>
              <a
                href={`https://stellar.expert/explorer/${network === 'public' ? 'public' : 'testnet'}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer noopener"
                className="break-all font-mono text-label-md text-primary underline"
                data-testid="explorer-link"
              >
                {txHash}
              </a>
            </div>
          )}
        </div>
      )

    case 'already_claimed':
      return (
        <Centred>
          <Icon name="check_circle" size={32} className="text-on-surface-variant" />
          <p className="text-headline-sm text-on-surface">Already claimed</p>
          <p className="text-body-md text-on-surface-variant">
            {claimedAt ? `Claimed on ${formatDate(claimedAt)}.` : 'This link has already been used.'}
          </p>
          {claimedBy && (
            <p className="font-mono text-label-md text-on-surface-variant">
              <StellarAddress value={claimedBy} />
            </p>
          )}
        </Centred>
      )

    case 'expired':
      return (
        <Centred>
          <Icon name="history" size={32} className="text-on-surface-variant" />
          <p className="text-headline-sm text-on-surface">This link has expired</p>
          <p className="text-body-md text-on-surface-variant">
            {link?.expiresAt
              ? `It expired on ${formatDate(link.expiresAt)}, and the funds went back to the sender.`
              : 'The funds have gone back to the sender.'}{' '}
            Ask them for a new link.
          </p>
        </Centred>
      )

    case 'failed':
      return (
        <Centred>
          <Icon name="warning" size={32} className="text-error" />
          <p className="text-headline-sm text-on-surface">That did not go through</p>
          {/*
            The first thing a person fears is that the money is gone. Say it is
            not, before explaining anything else.
          */}
          <p className="text-body-md text-on-surface-variant">
            Your funds are untouched. {error ?? 'Something went wrong on the way to Stellar.'}
          </p>
          <Button onClick={onRetry} data-testid="claim-retry">
            Try again
          </Button>
        </Centred>
      )
  }
}

/**
 * Exchange deposit (#75). Address plus memo instead of a wallet, with the
 * memo checked as it is typed and an unmissable statement — before the
 * irreversible step — that a wrong memo cannot be recovered by anyone.
 */
function DepositForm({
  link,
  onDeposit,
  lookupFederation,
  quoteLoading = false,
}: {
  link: LinkDetails
  onDeposit: (deposit: Deposit) => void
  lookupFederation?: (address: string) => Promise<{ accountId: string; memo: DepositMemo | null }>
  /** A receive-as price still being fetched: committing now would send the asset as sent. */
  quoteLoading?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [address, setAddress] = useState('')
  const [memoType, setMemoType] = useState<MemoType>('id')
  const [memoValue, setMemoValue] = useState('')
  const [lookup, setLookup] = useState<{ status: 'idle' } | { status: 'busy' } | { status: 'error'; detail: string } | { status: 'done'; accountId: string }>({ status: 'idle' })
  const [confirmed, setConfirmed] = useState(false)

  const trimmed = address.trim()
  const isFederation = trimmed.includes('*')
  const publicKey = lookup.status === 'done' && isFederation ? lookup.accountId : trimmed
  const addressOk = StrKey.isValidEd25519PublicKey(publicKey)
  const memoCheck = checkMemo({ type: memoType, value: memoValue })
  const ready = addressOk && memoCheck.ok && confirmed

  async function resolveFederation() {
    if (!lookupFederation) return
    setLookup({ status: 'busy' })
    try {
      const result = await lookupFederation(trimmed)
      setLookup({ status: 'done', accountId: result.accountId })
      if (result.memo) {
        setMemoType(result.memo.type)
        setMemoValue(result.memo.value)
      }
    } catch (caught) {
      setLookup({ status: 'error', detail: caught instanceof Error ? caught.message : 'That address could not be looked up.' })
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="deposit-open"
        className="min-h-11 text-center font-mono text-label-md text-primary underline-offset-4 hover:underline"
      >
        Send to an exchange or custodian account instead
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-md rounded-lg border border-outline-variant bg-surface-container-low p-md" data-testid="deposit-form">
      <p className="text-label-md font-semibold text-on-surface">Send to an exchange or custodian</p>
      <p className="text-body-md text-on-surface-variant">
        Use the {link.assetCode} deposit address <em>and</em> the memo your exchange shows you. The exchange keeps one
        shared account and tells deposits apart by the memo alone.
      </p>

      <label className="flex flex-col gap-xs">
        <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Deposit address</span>
        <input
          value={address}
          onChange={(e) => {
            setAddress(e.target.value)
            setLookup({ status: 'idle' })
          }}
          placeholder="G… or name*exchange.com"
          spellCheck={false}
          autoComplete="off"
          data-testid="deposit-address"
          className="min-h-11 rounded-lg border border-outline bg-surface px-3 font-mono text-label-md text-on-surface"
        />
      </label>
      {isFederation && lookupFederation && (
        <div className="flex flex-wrap items-center gap-sm">
          <Button variant="secondary" onClick={() => void resolveFederation()} disabled={lookup.status === 'busy'}>
            {lookup.status === 'busy' ? 'Looking up…' : 'Look up address'}
          </Button>
          {lookup.status === 'done' && (
            <span className="font-mono text-label-sm text-on-surface-variant">→ {lookup.accountId.slice(0, 8)}…{lookup.accountId.slice(-4)}</span>
          )}
          {lookup.status === 'error' && <span role="alert" className="text-label-sm text-error">{lookup.detail}</span>}
        </div>
      )}
      {trimmed.length > 0 && !isFederation && !addressOk && (
        <p role="alert" className="text-label-sm text-error">That is not a Stellar address (G…) or a federation address (name*domain).</p>
      )}

      <div className="grid grid-cols-[auto_1fr] gap-sm">
        <label className="flex flex-col gap-xs">
          <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Memo type</span>
          <select
            value={memoType}
            onChange={(e) => setMemoType(e.target.value as MemoType)}
            data-testid="deposit-memo-type"
            className="min-h-11 rounded-lg border border-outline bg-surface px-3 font-mono text-label-md text-on-surface"
          >
            {MEMO_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-xs">
          <span className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Memo</span>
          <input
            value={memoValue}
            onChange={(e) => setMemoValue(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            data-testid="deposit-memo"
            className="min-h-11 rounded-lg border border-outline bg-surface px-3 font-mono text-label-md text-on-surface"
          />
        </label>
      </div>
      {memoValue.length > 0 && !memoCheck.ok && (
        <p role="alert" className="text-label-sm text-error" data-testid="deposit-memo-error">{memoCheck.detail}</p>
      )}

      {/* BRAND.md §5.7: a warning panel is reserved for the irreversible. This is it. */}
      <div role="alert" className="rounded-lg border border-error-container bg-error-container/30 p-md">
        <div className="flex gap-sm">
          <Icon name="warning" size={20} filled className="shrink-0 text-error" />
          <div>
            <p className="text-body-md font-bold text-on-surface">A wrong memo cannot be undone</p>
            <p className="mt-1 text-body-md text-on-surface-variant">
              The funds go into the exchange’s shared account and are credited from the memo alone. If the memo is
              wrong or missing, <span className="font-semibold text-on-surface">no one — not Kleym, not the sender — can get them back.</span>{' '}
              Copy both from your exchange’s deposit page and check them character by character.
            </p>
          </div>
        </div>
      </div>
      <label className="flex items-start gap-sm text-body-md text-on-surface">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          data-testid="deposit-confirm"
          className="mt-1 h-5 w-5"
        />
        <span>I have checked the address and the memo against my exchange’s {link.assetCode} deposit page.</span>
      </label>

      <Button
        variant="claim"
        className="w-full"
        // Not while a price is loading, for the same reason as the wallet button:
        // the flow commits to the conversion shown, and none is shown yet.
        disabled={!ready || quoteLoading}
        onClick={() => memoCheck.ok && onDeposit({ publicKey, memo: memoCheck.memo })}
        data-testid="deposit-claim"
      >
        Send to this address
      </Button>
    </div>
  )
}

/**
 * CODE policy (#79): the thirteen-character claim code the sender handed over
 * separately. Five attempts then a fifteen-minute lock, server-side.
 */
function CodePanel({ error, onVerify }: { error: string | null; onVerify: (code: string) => void }) {
  const [code, setCode] = useState('')
  const cleaned = code.toUpperCase().replace(/[-\s]/g, '')
  const complete = cleaned.length === 13

  return (
    <form
      className="flex flex-col items-center gap-md text-center"
      onSubmit={(event) => {
        event.preventDefault()
        if (complete) onVerify(cleaned)
      }}
    >
      <p className="text-headline-sm text-on-surface">Enter your claim code</p>
      <p className="text-body-md text-on-surface-variant">
        The sender gave you a thirteen-character code separately from this link. It confirms the link reached the
        person it was meant for.
      </p>
      <label className="sr-only" htmlFor="claim-code">Claim code</label>
      <input
        id="claim-code"
        name="claim-code"
        value={code}
        onChange={(event) => setCode(event.target.value.slice(0, 20))}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'claim-code-error' : undefined}
        data-testid="claim-code"
        className="w-72 rounded-lg border border-outline-variant bg-surface px-md py-sm text-center font-mono text-headline-sm tracking-[0.2em] text-on-surface"
      />
      {error && (
        <p id="claim-code-error" role="alert" className="text-body-md text-error">{error}</p>
      )}
      <Button type="submit" disabled={!complete}>Continue</Button>
    </form>
  )
}

/**
 * PASSKEY policy (#79): register on first claim, use the same device after.
 * The browser's WebAuthn prompt does the work; this explains what it is for.
 */
function PasskeyPanel({ error, bound, onPasskey }: { error: string | null; bound: boolean; onPasskey: () => void }) {
  return (
    <Centred>
      <p className="text-headline-sm text-on-surface">{bound ? 'Use your passkey' : 'Register a passkey to claim'}</p>
      <p className="text-body-md text-on-surface-variant">
        {bound
          ? 'This link is bound to the passkey registered when it was first opened. Use that device to continue.'
          : 'This link will be bound to a passkey on this device — a fingerprint, face or PIN. After that, only this device can claim it, so a copy of the link is useless to anyone else.'}
      </p>
      {error && <p role="alert" className="text-body-md text-error">{error}</p>}
      <Button onClick={onPasskey} data-testid="claim-passkey">{bound ? 'Continue with passkey' : 'Register passkey'}</Button>
    </Centred>
  )
}

/**
 * Receive-as (#74). The recipient picks what to receive; the price comes from
 * Kleym, is shown with the floor the claim is held to, and when there is no
 * market the original asset is what they get — said plainly, not hidden.
 */
function ReceiveAsChooser({
  link,
  chosen,
  quote,
  onChoose,
}: {
  link: LinkDetails
  chosen: ReceiveAsOption | null
  quote: ReceiveAsQuote | null
  onChoose: (option: ReceiveAsOption | null) => void
}) {
  const key = (o: ReceiveAsOption | null) => (o ? `${o.assetCode}:${o.assetIssuer ?? ''}` : '')
  // Two issuers of the same code must not both read as "USDC": name the issuer when codes collide.
  const label = (o: ReceiveAsOption) => {
    const collides = link.receiveAs.filter((other) => other.assetCode === o.assetCode).length > 1
    return collides && o.assetIssuer ? `${o.assetCode} (${o.assetIssuer.slice(0, 4)}…${o.assetIssuer.slice(-4)})` : o.assetCode
  }
  return (
    <div className="flex flex-col gap-xs rounded-lg border border-outline-variant bg-surface-container-low p-md">
      <label htmlFor="receive-as" className="text-label-md font-semibold text-on-surface">
        Receive as
      </label>
      <select
        id="receive-as"
        data-testid="receive-as"
        value={key(chosen)}
        onChange={(e) => onChoose(link.receiveAs.find((o) => key(o) === e.target.value) ?? null)}
        className="min-h-11 rounded-lg border border-outline bg-surface px-3 font-mono text-label-md text-on-surface"
      >
        <option value="">{link.assetCode} — as sent</option>
        {link.receiveAs.map((option) => (
          <option key={key(option)} value={key(option)}>
            {label(option)}
          </option>
        ))}
      </select>
      {chosen && quote?.status === 'loading' && (
        <p role="status" className="text-body-md text-on-surface-variant">Getting a price…</p>
      )}
      {chosen && quote?.status === 'quoted' && (
        <p role="status" className="text-body-md text-on-surface-variant" data-testid="receive-as-quote">
          About <span className="font-mono text-on-surface">{quote.destAmount} {chosen.assetCode}</span> at today’s
          price, and never less than <span className="font-mono text-on-surface">{quote.destMin}</span>. If the price
          moves further than that before the claim lands, it will not go through and you can take {link.assetCode} instead.
        </p>
      )}
      {chosen && quote?.status === 'unavailable' && (
        <p role="status" className="text-body-md text-on-surface-variant">
          {quote.detail} Choose “{link.assetCode} — as sent” to continue.
        </p>
      )}
    </div>
  )
}

/**
 * Six-digit code entry. SPEC.md §6.4, §5.1's `otp_required`.
 *
 * The code is held in component state and never written anywhere else — no
 * URL, no storage, no logging. `inputMode="numeric"` and `autoComplete`
 * `one-time-code` let a phone's keyboard and its OS autofill do the obvious
 * thing, which is the difference between this being a small step and a chore.
 */
function OtpPanel({
  error,
  onVerify,
  onResend,
}: {
  error: string | null
  onVerify: (code: string) => void
  onResend: () => void
}) {
  const [code, setCode] = useState('')
  const complete = /^[0-9]{6}$/.test(code)

  return (
    <form
      className="flex flex-col items-center gap-md text-center"
      onSubmit={(event) => {
        event.preventDefault()
        if (complete) onVerify(code)
      }}
    >
      <p className="text-headline-sm text-on-surface">Enter the code we emailed you</p>
      <p className="text-body-md text-on-surface-variant">
        Six digits, valid for ten minutes. This link was sent by email, so the code confirms
        it reached the right person.
      </p>

      <label className="sr-only" htmlFor="otp">
        Six-digit code
      </label>
      <input
        id="otp"
        name="otp"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'otp-error' : undefined}
        className="w-48 rounded-lg border border-outline-variant bg-surface px-md py-sm text-center font-mono text-headline-md tracking-[0.4em] text-on-surface"
      />

      {error && (
        <p id="otp-error" role="alert" className="text-body-md text-error">
          {error}
        </p>
      )}

      <Button type="submit" disabled={!complete}>
        Claim
      </Button>

      <button
        type="button"
        onClick={onResend}
        className="text-label-md text-on-surface-variant underline underline-offset-4"
      >
        Send a new code
      </button>
    </form>
  )
}
