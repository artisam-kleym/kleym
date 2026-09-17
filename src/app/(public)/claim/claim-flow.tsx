'use client'

/**
 * The claim flow. SPEC.md §5.1, §3.3, §3.6.
 *
 * The seed lives in this component's ref for the length of one claim and
 * nowhere else. It is used to derive a public key and to sign two transactions
 * in memory — it is never sent, stored, or logged (AGENT.md §1, §4.5).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { ClaimPanel } from '@/components/ui'
import { clearFragment, readFragment } from '@/lib/claim/fragment'
import { claimTraceHeaders } from '@/lib/claim/trace'
import { isConversionRefused, isDepositRefused, isNotReady, retryTarget, stateFromProblem, type ClaimState } from '@/lib/claim/machine'
import { ClaimScreen, type Deposit, type DepositDraft, type LinkDetails, type ReceiveAsOption, type ReceiveAsQuote } from './screens'
import type { DepositMemo } from '@/lib/stellar/memo'

/**
 * One ledger is ~5s. §3.3.1 says the boundary is the ledger, not the clock, so
 * this is only the FIRST wait: if `prepare/claim` then answers not-ready, the
 * page asks again rather than giving up on a slow ledger.
 */
const LEDGER_WAIT_MS = 5_000
const NOT_READY_RETRY_MS = 2_500
const NOT_READY_ATTEMPTS = 8

/** Content type, plus the OTP token when one has been earned. */
/** Content type, the OTP token when one is held, and the trace header (#53). */
/** Base64 without Buffer: the browser has neither, and the SDK's sign() returns bytes. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function claimHeaders(token: string | null): Record<string, string> {
  return token
    ? { 'content-type': 'application/json', 'x-kleym-otp': token, ...claimTraceHeaders() }
    : { 'content-type': 'application/json', ...claimTraceHeaders() }
}

export function ClaimFlow({ network }: { network: 'testnet' | 'public' }) {
  const [state, setState] = useState<ClaimState>('loading')
  const [link, setLink] = useState<LinkDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [claimedAt, setClaimedAt] = useState<string | null>(null)
  const [claimedBy, setClaimedBy] = useState<string | null>(null)

  /*
   * Receive-as (#74). The chosen asset and its live quote are ordinary state —
   * nothing secret here. The quote is Kleym's own, and the price the claim is
   * held to is set again on the server when the envelope is built; this one is
   * what the recipient reads before committing.
   */
  const [receiveAs, setReceiveAs] = useState<ReceiveAsOption | null>(null)
  const [quote, setQuote] = useState<ReceiveAsQuote | null>(null)
  /** The latest quote request; an older one resolving later is dropped, not shown. */
  const quoteRequest = useRef(0)
  const [delivered, setDelivered] = useState<{ assetCode: string; destAmount: string; destMin: string } | null>(null)

  /*
   * Exchange deposit (#75). Held in a ref like the recipient key: it is the
   * destination the flow is committed to across a retry, and a retry must
   * not quietly switch from "deposit with memo" back to "connect a wallet".
   */
  const deposit = useRef<Deposit | null>(null)
  /** The last deposit address tried, so a later wallet path never inherits it as the recipient. */
  const lastDeposit = useRef<string | null>(null)
  const [depositMade, setDepositMade] = useState<Deposit | null>(null)
  /** The deposit form as typed (a ref: it changes on every keystroke) and, after a refusal, what the form re-opens with. */
  const depositDraft = useRef<DepositDraft | null>(null)
  const [depositRestore, setDepositRestore] = useState<DepositDraft | null>(null)
  const onDepositDraft = useCallback((draft: DepositDraft) => {
    depositDraft.current = draft
  }, [])

  /*
   * A ref, not state. The seed must not be part of anything React might
   * serialise, and it must survive re-renders without being a dependency that
   * gets copied into closures more than necessary.
   */
  const seed = useRef<string | null>(null)
  const ephemeral = useRef<string | null>(null)

  /*
   * The OTP token, in a ref for the same reason the seed is: it is a
   * credential, and it should not be part of anything React might serialise
   * into the page. It is sent as a header rather than in a body so it never
   * lands in a request body that something downstream decides to log.
   */
  const otpToken = useRef<string | null>(null)
  const [otpError, setOtpError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const materialised = useRef(false)
  const recipient = useRef<string | null>(null)

  /*
   * Read the fragment, remove it, then resolve the link. SPEC.md §3.6.
   *
   * The whole body is async so no state is set synchronously during the
   * effect — the URL is an external system this synchronises with, which is
   * what effects are for, but a synchronous transition here would cascade a
   * render before the browser has painted anything.
   */
  useEffect(() => {
    let cancelled = false

    void (async () => {
      const fragment = readFragment(window.location.hash)

      // Cleared whether or not it parsed — a malformed fragment is still
      // something that should not sit in the address bar.
      clearFragment()

      if (!fragment.ok) {
        if (!cancelled) setState('invalid')
        return
      }

      seed.current = fragment.secret
      ephemeral.current = fragment.ephemeralPublicKey

      try {
        const response = await fetch(
          `/api/claims/resolve?pk=${encodeURIComponent(fragment.ephemeralPublicKey)}`,
          { headers: claimTraceHeaders() },
        )
        if (cancelled) return

        if (!response.ok) return setState('invalid')
        const body = await response.json()
        if (cancelled) return

        if (body.status !== 'claimable') {
          /*
           * `resolve` answers identically for unknown, expired and claimed
           * (SPEC.md §6.4), so the page genuinely cannot tell them apart here.
           * The specific reason arrives from `prepare`, which the recipient
           * reaches by acting on the link they hold — a passer-by learns
           * nothing, the holder is told what happened.
           */
          return setState('invalid')
        }

        const policy: LinkDetails['policy'] = ['open', 'code', 'email', 'passkey'].includes(body.policy) ? body.policy : 'open'
        setLink({
          amount: body.amount,
          assetCode: body.assetCode,
          senderName: body.senderName,
          expiresAt: body.expiresAt,
          network: body.network,
          policy,
          passkeyBound: body.passkeyBound === true,
          receiveAs: Array.isArray(body.receiveAs) ? body.receiveAs : [],
          exchangeDeposit: body.exchangeDeposit === true,
        })
        /*
         * The policy (#79) is shown on the ready screen, and the credential is
         * asked for BEFORE the wallet — the same order as the OTP gate (#14):
         * the recipient holds the URL; the credential proves the link reached
         * the person, channel or device it was bound to (SPEC.md §6.4).
         */
        if (policy === 'email' && !body.otpRequired) setState('email_only')
        else if (body.otpRequired) setState('otp_required')
        else if (policy === 'code') setState('code_required')
        else if (policy === 'passkey') setState('passkey_required')
        else setState('ready')
      } catch {
        if (!cancelled) setState('invalid')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  /** Reads problem+json without ever echoing what was sent. */
  const problem = useCallback(async (response: Response) => {
    const body = await response.json().catch(() => null)
    return {
      status: response.status,
      type: (body?.type as string) ?? null,
      detail: (body?.detail as string) ?? null,
    }
  }, [])

  /** Picks an asset to receive as and fetches Kleym's quote for it; null is the asset as sent. */
  const onReceiveAs = useCallback(
    async (option: ReceiveAsOption | null) => {
      setReceiveAs(option)
      const request = ++quoteRequest.current
      if (!option) return setQuote(null)
      const ephemeralPublicKey = ephemeral.current
      if (!ephemeralPublicKey) return
      setQuote({ status: 'loading' })
      try {
        const response = await fetch('/api/claims/quote', {
          method: 'POST',
          // The OTP token too: the quote is gated like every other action on the link.
          headers: claimHeaders(otpToken.current),
          body: JSON.stringify({ ephemeralPublicKey, receiveAs: { assetCode: option.assetCode, assetIssuer: option.assetIssuer } }),
        })
        // A later selection has superseded this one: its answer is not ours to show.
        if (request !== quoteRequest.current) return
        if (!response.ok) {
          const p = await problem(response)
          return setQuote({ status: 'unavailable', detail: p.detail ?? `There is no market for ${option.assetCode} right now.` })
        }
        const body = await response.json()
        if (request !== quoteRequest.current) return
        setQuote({ status: 'quoted', destAmount: body.destAmount, destMin: body.destMin })
      } catch {
        if (request === quoteRequest.current) setQuote({ status: 'unavailable', detail: 'A price could not be fetched.' })
      }
    },
    [problem],
  )

  /*
   * `from` is where the flow starts, and it is `retryTarget`'s answer, not a
   * separate guess: `ready` runs the whole thing, `preparing` resumes at TX2
   * with the wallet and ephemeral account already in place.
   */
  const run = useCallback(async (from: ClaimState = 'ready') => {
    const secret = seed.current
    const ephemeralPublicKey = ephemeral.current
    if (!secret || !ephemeralPublicKey) return setState('invalid')

    const passphrase = network === 'public' ? Networks.PUBLIC : Networks.TESTNET
    const ephemeralKeypair = Keypair.fromSecret(secret)

    const sign = (xdr: string, extra?: Keypair) => {
      const tx = TransactionBuilder.fromXDR(xdr, passphrase) as Transaction
      tx.sign(ephemeralKeypair)
      if (extra) tx.sign(extra)
      return tx.toXDR()
    }

    setError(null)

    try {
      const { connectWallet, signBatch } = await import('./wallet')
      let recipientKey = recipient.current

      if (deposit.current) {
        /* Exchange deposit (#75): the destination is typed, not connected. No wallet is involved. */
        recipientKey = deposit.current.publicKey
        recipient.current = recipientKey
      } else if (from !== 'preparing' || !recipientKey || recipientKey === lastDeposit.current) {
        /* Wallet first — §3.3 says TX1 fires on COMMITMENT, not on page load. A key left
           over from an abandoned deposit is never reused as a wallet. */
        /* Wallet first — §3.3 says TX1 fires on COMMITMENT, not on page load. */
        setState('wallet_connecting')
        recipientKey = await connectWallet(network)
        recipient.current = recipientKey
      }

      /* TX1. Skipped on a resume: the ephemeral account is already on the ledger. */
      if (from !== 'preparing') {
        setState('materialising')
        const prepared = await fetch('/api/claims/prepare/materialise', {
          method: 'POST',
          headers: claimHeaders(otpToken.current),
          body: JSON.stringify({ ephemeralPublicKey }),
        })
        if (!prepared.ok) {
          const p = await problem(prepared)
          setError(p.detail)
          return setState(stateFromProblem(p.status, p.type))
        }
        const body = await prepared.json()

        if (!body.alreadyExists) {
          const submitted = await fetch('/api/claims/submit', {
            method: 'POST',
            headers: claimHeaders(otpToken.current),
            body: JSON.stringify({
              ephemeralPublicKey,
              signedXdr: sign(body.xdr),
              phase: 'materialise',
            }),
          })
          if (!submitted.ok) {
            const p = await problem(submitted)
            setError(p.detail)
            return setState(stateFromProblem(p.status, p.type))
          }

          /*
           * §3.3.1: TX2 must land in a LATER LEDGER than TX1, or the merge
           * fails `op_seq_num_too_far`. The boundary is the ledger, roughly
           * five seconds — this waits about one, and the not-ready loop below
           * covers a ledger that is slower than that.
           */
          setState('awaiting_ledger')
          await new Promise((resolve) => setTimeout(resolve, LEDGER_WAIT_MS))
        }
        materialised.current = true
      }

      /* TX2. */
      setState('preparing')
      // Only a chosen asset with a price in hand is asked for; anything else is the asset as sent.
      // The floor SHOWN travels with it, so the envelope is never bound below what was read.
      const conversion = receiveAs && quote?.status === 'quoted'
        ? { assetCode: receiveAs.assetCode, assetIssuer: receiveAs.assetIssuer, destMin: quote.destMin }
        : null
      let prepared: Response
      for (let attempt = 1; ; attempt += 1) {
        prepared = await fetch('/api/claims/prepare/claim', {
          method: 'POST',
          headers: claimHeaders(otpToken.current),
          body: JSON.stringify({
            ephemeralPublicKey,
            recipientPublicKey: recipientKey,
            ...(conversion ? { receiveAs: conversion } : {}),
            ...(deposit.current ? { memo: deposit.current.memo } : {}),
          }),
        })
        if (prepared.ok) break
        const p = await problem(prepared)
        // Stellar being slow is not a failure. Ask again, up to a bound.
        if (isNotReady(p.status, p.type) && attempt < NOT_READY_ATTEMPTS) {
          setState('awaiting_ledger')
          await new Promise((resolve) => setTimeout(resolve, NOT_READY_RETRY_MS))
          setState('preparing')
          continue
        }
        /*
         * No market for the chosen asset (#74). The funds are untouched; drop
         * the conversion so "Try again" claims the asset the sender sent, and
         * say so.
         */
        if (isConversionRefused(p.status, p.type)) {
          setReceiveAs(null)
          setQuote(null)
        }
        /*
         * The deposit address or memo was refused (#75). Drop it and go back
         * to `ready` so the recipient can fix it or connect a wallet — a
         * "Try again" with the same address is a dead end, and TX1 has
         * already landed, so resuming at TX2 from `ready` is what happens next.
         */
        if (isDepositRefused(p.status, p.type)) {
          deposit.current = null
          // Back to `ready` with the form open and filled as it was: the
          // recipient corrects one field, not the whole panel from scratch.
          setDepositRestore(depositDraft.current)
          setError(p.detail)
          return setState('ready')
        }
        setError(p.detail)
        return setState(stateFromProblem(p.status, p.type))
      }
      const plan = await prepared.json()

      /*
       * The recipient signs ONLY when they source an operation. Signing when
       * they do not returns `tx_bad_auth_extra` — the server tells us which,
       * because only it has seen the ledger.
       */
      let signedXdr = sign(plan.xdr)
      if (plan.needsRecipientSignature) {
        // An exchange account cannot sign; the server refuses that shape before
        // it gets here, so this is a belt for the braces.
        if (deposit.current) throw new Error('That address would need to sign, which an exchange account cannot. Check the deposit address with your exchange.')
        setState('awaiting_signature')
        signedXdr = await signBatch(signedXdr, network, recipientKey)
      }

      setState('submitting')
      const submitted = await fetch('/api/claims/submit', {
        method: 'POST',
        headers: claimHeaders(otpToken.current),
        body: JSON.stringify({ ephemeralPublicKey, signedXdr, phase: 'claim' }),
      })
      if (!submitted.ok) {
        const p = await problem(submitted)
        // The price moved past the bound (#74): refused rather than filled.
        // Retry claims the asset as sent.
        if (isConversionRefused(p.status, p.type)) {
          setReceiveAs(null)
          setQuote(null)
        }
        setError(p.detail)
        return setState(stateFromProblem(p.status, p.type))
      }

      const result = await submitted.json()
      setTxHash(result.hash)
      setClaimedAt(new Date().toISOString())
      setClaimedBy(recipientKey)
      setDelivered(plan.conversion ? { assetCode: plan.conversion.assetCode, destAmount: plan.conversion.destAmount, destMin: plan.conversion.destMin } : null)
      setDepositMade(deposit.current)
      setState('claimed_success')
    } catch (caught) {
      const { walletErrorMessage } = await import('./wallet')
      setError(await walletErrorMessage(caught))
      setState('failed')
    }
  }, [network, problem, receiveAs, quote])

  /*
   * Retry resumes at TX2 when TX1 has landed. Restarting from `ready` would
   * materialise a SECOND ephemeral account and strand the first's sponsored
   * reserves, which §3.3.2 says Kleym cannot recover.
   */
  const onRetry = useCallback(() => {
    const target = retryTarget(materialised.current)
    setState(target)
    void run(target)
  }, [run])

  /** Exchange deposit (#75): commit to an address and memo, then run the same flow with no wallet. */
  const onDeposit = useCallback(
    (chosen: Deposit) => {
      deposit.current = chosen
      lastDeposit.current = chosen.publicKey
      void run()
    },
    [run],
  )

  /**
   * "Connect wallet" is explicitly the WALLET path. A deposit chosen earlier —
   * then bounced to `ready` by a lapsed OTP, or refused — must not hijack it
   * and send the funds to that address without a wallet ever connecting.
   */
  const onConnect = useCallback(() => {
    deposit.current = null
    void run()
  }, [run])

  const lookupFederation = useCallback(
    async (address: string): Promise<{ accountId: string; memo: DepositMemo | null }> => {
      const response = await fetch('/api/claims/federation', {
        method: 'POST',
        headers: claimHeaders(null),
        body: JSON.stringify({ address }),
      })
      if (!response.ok) {
        const p = await problem(response)
        throw new Error(p.detail ?? 'That address could not be looked up.')
      }
      return (await response.json()) as { accountId: string; memo: DepositMemo | null }
    },
    [problem],
  )

  async function verifyOtp(code: string) {
    const ephemeralPublicKey = ephemeral.current
    if (!ephemeralPublicKey) return
    setOtpError(null)
    try {
      const response = await fetch('/api/claims/otp/verify', {
        method: 'POST',
        headers: claimHeaders(null),
        body: JSON.stringify({ ephemeralPublicKey, code }),
      })
      if (!response.ok) {
        const p = await problem(response)
        setOtpError(p.detail ?? 'That code did not work.')
        return
      }
      const body = await response.json()
      otpToken.current = body.token
      setState('ready')
    } catch {
      setOtpError('The code could not be checked. Try again.')
    }
  }

  /** CODE policy (#79): the code becomes the same kind of token the OTP earns. */
  async function verifyCode(code: string) {
    const ephemeralPublicKey = ephemeral.current
    if (!ephemeralPublicKey) return
    setCodeError(null)
    try {
      const response = await fetch('/api/claims/code/verify', {
        method: 'POST',
        // The OTP token rides along: on an emailed link the code is the SECOND factor.
        headers: claimHeaders(otpToken.current),
        body: JSON.stringify({ ephemeralPublicKey, code }),
      })
      if (!response.ok) {
        const p = await problem(response)
        setCodeError(p.detail ?? 'That code did not work.')
        return
      }
      const body = await response.json()
      otpToken.current = body.token
      setState('ready')
    } catch {
      setCodeError('The code could not be checked. Try again.')
    }
  }

  /**
   * PASSKEY policy (#79): register on first claim, assert afterwards. The
   * WebAuthn library is loaded on demand and is bundled — no third-party
   * request leaves this page (SPEC.md §3.6).
   */
  async function runPasskey() {
    const ephemeralPublicKey = ephemeral.current
    if (!ephemeralPublicKey) return
    setPasskeyError(null)
    const bound = link?.passkeyBound === true
    const stage = bound ? 'authenticate' : 'register'
    try {
      const { startRegistration, startAuthentication } = await import('@simplewebauthn/browser')
      const optionsResponse = await fetch(`/api/claims/passkey/${stage}/options`, {
        method: 'POST',
        headers: claimHeaders(null),
        body: JSON.stringify({ ephemeralPublicKey }),
      })
      if (!optionsResponse.ok) {
        const p = await problem(optionsResponse)
        setPasskeyError(p.detail ?? 'The passkey could not be started.')
        return
      }
      const optionsJSON = await optionsResponse.json()
      const credential = bound
        ? await startAuthentication({ optionsJSON })
        : await startRegistration({ optionsJSON })
      /*
       * Registration carries proof that THIS page holds the link: the
       * ephemeral keypair's signature over the challenge. The public key is
       * on the ledger for anyone to read; the seed is only here. Without this
       * a passer-by could bind their own device to every live link.
       */
      const secret = seed.current
      const proof = !bound && secret
        // The SDK types `sign` as taking a Buffer; at runtime it signs any byte array (tweetnacl).
        ? bytesToBase64(Keypair.fromSecret(secret).sign(new TextEncoder().encode(optionsJSON.challenge as string) as unknown as Buffer))
        : undefined
      const verified = await fetch(`/api/claims/passkey/${stage}`, {
        method: 'POST',
        // The OTP token rides along: on an emailed link the passkey is the SECOND factor.
        headers: claimHeaders(otpToken.current),
        body: JSON.stringify({ ephemeralPublicKey, response: credential, ...(proof ? { proof } : {}) }),
      })
      if (!verified.ok) {
        const p = await problem(verified)
        setPasskeyError(p.detail ?? 'The passkey could not be verified.')
        return
      }
      const body = await verified.json()
      otpToken.current = body.token
      if (!bound) setLink((current) => (current ? { ...current, passkeyBound: true } : current))
      setState('ready')
    } catch (caught) {
      setPasskeyError(caught instanceof Error && caught.name === 'NotAllowedError' ? 'The passkey prompt was cancelled.' : 'The passkey could not be used on this device.')
    }
  }

  async function resendOtp() {
    const ephemeralPublicKey = ephemeral.current
    if (!ephemeralPublicKey) return
    setOtpError(null)
    try {
      const response = await fetch('/api/claims/otp/request', {
        method: 'POST',
        headers: claimHeaders(null),
        body: JSON.stringify({ ephemeralPublicKey }),
      })
      if (!response.ok) {
        const p = await problem(response)
        setOtpError(p.detail ?? 'A new code could not be sent.')
      }
    } catch {
      setOtpError('A new code could not be sent.')
    }
  }

  return (
    <ClaimPanel>
      {/*
        Announces state changes to a screen reader. The visual transitions are
        the whole interface here, and several take seconds.
      */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="claim-state">
        {state}
      </div>
      <ClaimScreen
        state={state}
        link={link}
        error={error}
        txHash={txHash}
        network={network}
        claimedAt={claimedAt}
        claimedBy={claimedBy}
        onConnect={onConnect}
        otpError={otpError}
        onVerifyOtp={verifyOtp}
        onResendOtp={resendOtp}
        onRetry={onRetry}
        codeError={codeError}
        onVerifyCode={(code) => void verifyCode(code)}
        passkeyError={passkeyError}
        onPasskey={() => void runPasskey()}
        receiveAs={receiveAs}
        quote={quote}
        onReceiveAs={(option) => void onReceiveAs(option)}
        delivered={delivered}
        onDeposit={onDeposit}
        depositDraft={depositRestore}
        onDepositDraft={onDepositDraft}
        lookupFederation={lookupFederation}
        depositMade={depositMade}
      />
    </ClaimPanel>
  )
}
