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
import { retryTarget, stateFromProblem, type ClaimState } from '@/lib/claim/machine'
import { ClaimScreen, type LinkDetails } from './screens'

/** One ledger is ~5s; §3.3.1 says the boundary is the ledger, not the clock. */
const LEDGER_WAIT_MS = 7_000

export function ClaimFlow({ network }: { network: 'testnet' | 'public' }) {
  const [state, setState] = useState<ClaimState>('loading')
  const [link, setLink] = useState<LinkDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [claimedAt, setClaimedAt] = useState<string | null>(null)
  const [claimedBy, setClaimedBy] = useState<string | null>(null)

  /*
   * A ref, not state. The seed must not be part of anything React might
   * serialise, and it must survive re-renders without being a dependency that
   * gets copied into closures more than necessary.
   */
  const seed = useRef<string | null>(null)
  const ephemeral = useRef<string | null>(null)
  const materialised = useRef(false)

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

        setLink({
          amount: body.amount,
          assetCode: body.assetCode,
          senderName: body.senderName,
          expiresAt: body.expiresAt,
          network: body.network,
        })
        setState('ready')
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
    return { status: response.status, detail: (body?.detail as string) ?? null }
  }, [])

  const run = useCallback(async () => {
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
      /* Wallet first — §3.3 says TX1 fires on COMMITMENT, not on page load. */
      setState('wallet_connecting')
      const { connectWallet, signBatch } = await import('./wallet')
      const recipient = await connectWallet(network)

      /* TX1. Skipped when the ephemeral account is already on the ledger. */
      if (!materialised.current) {
        setState('materialising')
        const prepared = await fetch('/api/claims/prepare/materialise', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ephemeralPublicKey }),
        })
        if (!prepared.ok) {
          const p = await problem(prepared)
          setError(p.detail)
          return setState(stateFromProblem(p.status, p.detail))
        }
        const body = await prepared.json()

        if (!body.alreadyExists) {
          const submitted = await fetch('/api/claims/submit', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              ephemeralPublicKey,
              signedXdr: sign(body.xdr),
              phase: 'materialise',
            }),
          })
          if (!submitted.ok) {
            const p = await problem(submitted)
            setError(p.detail)
            return setState(stateFromProblem(p.status, p.detail))
          }

          /*
           * §3.3.1: TX2 must land in a LATER LEDGER than TX1, or the merge
           * fails `op_seq_num_too_far`. The boundary is the ledger, roughly
           * five seconds — this waits a little longer rather than racing it.
           */
          setState('awaiting_ledger')
          await new Promise((resolve) => setTimeout(resolve, LEDGER_WAIT_MS))
        }
        materialised.current = true
      }

      /* TX2. */
      setState('preparing')
      const prepared = await fetch('/api/claims/prepare/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ephemeralPublicKey, recipientPublicKey: recipient }),
      })
      if (!prepared.ok) {
        const p = await problem(prepared)
        setError(p.detail)
        return setState(stateFromProblem(p.status, p.detail))
      }
      const plan = await prepared.json()

      /*
       * The recipient signs ONLY when they source an operation. Signing when
       * they do not returns `tx_bad_auth_extra` — the server tells us which,
       * because only it has seen the ledger.
       */
      let signedXdr = sign(plan.xdr)
      if (plan.needsRecipientSignature) {
        setState('awaiting_signature')
        signedXdr = await signBatch(signedXdr, network, recipient)
      }

      setState('submitting')
      const submitted = await fetch('/api/claims/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ephemeralPublicKey, signedXdr, phase: 'claim' }),
      })
      if (!submitted.ok) {
        const p = await problem(submitted)
        setError(p.detail)
        return setState(stateFromProblem(p.status, p.detail))
      }

      const result = await submitted.json()
      setTxHash(result.hash)
      setClaimedAt(new Date().toISOString())
      setClaimedBy(recipient)
      setState('claimed_success')
    } catch (caught) {
      const { walletErrorMessage } = await import('./wallet')
      setError(await walletErrorMessage(caught))
      setState('failed')
    }
  }, [network, problem])

  /*
   * Retry resumes at TX2 when TX1 has landed. Restarting from `ready` would
   * materialise a SECOND ephemeral account and strand the first's sponsored
   * reserves, which §3.3.2 says Kleym cannot recover.
   */
  const onRetry = useCallback(() => {
    setState(retryTarget(materialised.current))
    void run()
  }, [run])

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
        onConnect={() => void run()}
        onRetry={onRetry}
      />
    </ClaimPanel>
  )
}
