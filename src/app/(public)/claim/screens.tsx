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
  /** Who may claim (#79), told before the recipient commits to anything. */
  policy: 'open' | 'code' | 'email' | 'passkey'
  /** PASSKEY policy: whether a device has already been bound to this link. */
  passkeyBound?: boolean
}

/** What each policy means for the person reading, in their words. */
export const POLICY_COPY: Record<LinkDetails['policy'], string> = {
  open: 'Anyone who has this link can claim it — keep it to yourself.',
  code: 'This link is bound to a claim code the sender gave you separately. You will be asked for it.',
  email: 'This link was sent to an email address and can only be claimed with the code sent to that address.',
  passkey: 'This link is bound to a passkey. The first time, you register one on this device; after that only that device can claim.',
}

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

          {link && (
            <p className="text-center text-body-md text-on-surface-variant" data-testid="claim-policy" data-policy={link.policy}>
              {POLICY_COPY[link.policy]}
            </p>
          )}

          <Button variant="claim" onClick={onConnect} data-testid="claim-connect" className="w-full">
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
            {link && <Amount amount={link.amount} assetCode={link.assetCode} />}
            <p className="text-body-md text-on-surface-variant">
              The funds are in your wallet.
            </p>
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
