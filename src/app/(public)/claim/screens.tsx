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
import type { ReactNode } from 'react'
import { Button, Icon, StellarAddress } from '@/components/ui'
import type { ClaimState } from '@/lib/claim/machine'

export interface LinkDetails {
  amount: string
  assetCode: string
  senderName: string
  expiresAt: string
  network: string
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

          {link && (
            <p className="text-center font-mono text-label-sm text-on-surface-variant">
              Available until {formatDate(link.expiresAt)}
            </p>
          )}
        </div>
      )

    case 'otp_required':
      return (
        <Centred>
          <p className="text-headline-sm text-on-surface">Enter the code we emailed you</p>
          <p className="text-body-md text-on-surface-variant">
            Six digits, valid for ten minutes.
          </p>
          <p className="text-body-md text-on-surface-variant">
            Code entry arrives with email delivery.
          </p>
        </Centred>
      )

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
