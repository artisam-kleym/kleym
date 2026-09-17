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
import { Button, Icon, StellarAddress } from '@/components/ui'
import type { ClaimState } from '@/lib/claim/machine'

export interface LinkDetails {
  amount: string
  assetCode: string
  senderName: string
  expiresAt: string
  network: string
  /** Receive-as (#74): what the sender lets this recipient convert into. Empty when not offered. */
  receiveAs: ReceiveAsOption[]
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
  receiveAs = null,
  quote = null,
  onReceiveAs,
  delivered = null,
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
  /** Receive-as (#74): the asset chosen, null for the one the sender sent. */
  receiveAs?: ReceiveAsOption | null
  quote?: ReceiveAsQuote | null
  onReceiveAs?: (option: ReceiveAsOption | null) => void
  /** What TX2 actually delivered when converting, for the success screen. */
  delivered?: { assetCode: string; destAmount: string; destMin: string } | null
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

    case 'ready':
      return (
        <div className="flex flex-col gap-lg">
          <Centred>
            <p className="text-body-md text-on-surface-variant">
              {link?.senderName ? `${link.senderName} sent you` : 'You have received'}
            </p>
            {link && <Amount amount={link.amount} assetCode={link.assetCode} />}
          </Centred>

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
