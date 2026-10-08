'use client'

import { useStepUp } from '@/components/mfa/use-step-up'
import { useState } from 'react'
import Decimal from 'decimal.js'
import { Button, WarningPanel } from '@/components/ui'
import { connectWallet, signEnvelope, walletErrorMessage } from '@/lib/wallet/signing'

/**
 * Reclaim, with the confirmation BRAND.md §5.7 reserves a warning panel for.
 *
 * The action name stays constant through the flow — Reclaim → Reclaiming →
 * Reclaimed (BRAND.md §8). A sender who started an action should not have to
 * work out that "Return funds" and "Reclaimed" are the same thing.
 */
type Phase = 'idle' | 'confirming' | 'reclaiming' | 'reclaimed'

interface Done {
  transactionHash: string
  amount: string
  balanceCount: number
}

export function ReclaimPanel({
  campaignId,
  network,
  senderPublicKey,
  assetCode,
  expiresAt,
  expired,
  outstanding,
  alreadyReclaimed,
  sponsored = false,
}: {
  campaignId: string
  network: 'testnet' | 'public'
  senderPublicKey: string
  assetCode: string
  expiresAt: string
  /**
   * Decided on the server, not from `Date.now()` here.
   *
   * This component renders on the server first and then hydrates, so reading
   * the clock in its body invites the two renders to disagree about an
   * expiry that falls between them.
   */
  expired: boolean
  outstanding: number
  alreadyReclaimed: Done[]
  sponsored?: boolean
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done[]>(alreadyReclaimed)
  const stepUp = useStepUp()

  async function post(path: string, body: unknown): Promise<Response> {
    return fetch(`/api/campaigns/${campaignId}/reclaim/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // A fresh key per attempt: a retry after a wallet rejection is a NEW
        // request, not a replay of the one the sender abandoned.
        'idempotency-key': crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    })
  }

  async function reclaim() {
    setError(null)
    // Step-up (#47): reclaim moves money; a fresh second factor first, if one is enrolled.
    if (!(await stepUp.ensure())) return
    setPhase('reclaiming')
    try {
      const address = await connectWallet(network)
      if (address !== senderPublicKey) {
        setError(
          `That wallet is ${address.slice(0, 8)}…, but this campaign was funded by ${senderPublicKey.slice(0, 8)}…. Connect the funding wallet to reclaim.`,
        )
        setPhase('idle')
        return
      }

      /*
       * Loops until the server says there is nothing left.
       *
       * Each round is one batch of at most 90 balances and one signature. The
       * server rebuilds from a live ledger query every time, so a recipient
       * claiming mid-flow shrinks the next batch rather than failing it.
       *
       * ONLY the nothing-left conflict ends the loop. `prepare` also answers
       * 409 for "not expired yet" and "the sender account does not exist on
       * this network", and both of those are things the sender has to see —
       * breaking on any 409 turned them into "nothing left to reclaim".
       */
      const collected: Done[] = []
      for (;;) {
        const prepared = await post('prepare', {})
        if (!prepared.ok) {
          const problem = await readProblem(prepared)
          if (prepared.status === 409 && problem.type?.endsWith('/conflict/nothing-left')) break
          throw new Error(problem.detail)
        }

        const plan = (await prepared.json()) as { xdr: string }
        const signedXdr = await signEnvelope(plan.xdr, network, senderPublicKey)

        const submitted = await post('submit', { signedXdr })
        if (!submitted.ok) throw new Error(await detail(submitted))
        const receipt = (await submitted.json()) as Done
        if (!collected.some((entry) => entry.transactionHash === receipt.transactionHash)) collected.push(receipt)
        // A later batch failure must not hide refunds that already landed.
        setDone((prior) => prior.some((entry) => entry.transactionHash === receipt.transactionHash) ? prior : [receipt, ...prior])
      }

      if (collected.length === 0 && done.length === 0) {
        setError('There was nothing left to reclaim — the ledger holds no unclaimed balances.')
        setPhase('idle')
        return
      }
      setPhase('reclaimed')
    } catch (caught) {
      setError(await walletErrorMessage(caught))
      setPhase('idle')
    }
  }

  // Decimal, not Number — this is money on a page the sender reads. AGENT.md §4.1.
  const reclaimedTotal = done.reduce((sum, d) => sum.plus(d.amount), new Decimal(0)).toFixed()

  if (done.length > 0 && phase !== 'confirming' && phase !== 'reclaiming') {
    return (
      <section className="mt-lg rounded-lg border border-outline-variant/50 bg-surface-container p-lg">
        <h2 className="text-headline-md text-on-surface">Reclaimed</h2>
        <p className="mt-sm text-body-md text-on-surface-variant">
          {done.reduce((n, d) => n + d.balanceCount, 0)} unclaimed{' '}
          {done.reduce((n, d) => n + d.balanceCount, 0) === 1 ? 'link' : 'links'} returned{' '}
          {reclaimedTotal} {assetCode} to {senderPublicKey.slice(0, 8)}….
        </p>
        <ul className="mt-md space-y-1 font-mono text-label-sm text-on-surface-variant">
          {done.map((d) => (
            <li key={d.transactionHash}>{d.transactionHash}</li>
          ))}
        </ul>
        {outstanding > 0 && (
          <p className="mt-md text-body-md text-on-surface-variant">
            {outstanding} {outstanding === 1 ? 'link is' : 'links are'} still outstanding.
          </p>
        )}
        {error && <p role="alert" className="mt-md text-body-md text-error">{error}</p>}
        {expired && outstanding > 0 && <Button onClick={() => setPhase('confirming')}>Reclaim remaining funds</Button>}
      </section>
    )
  }

  if (!expired || outstanding === 0) return null

  return (
    <section className="mt-lg rounded-lg border border-outline-variant/50 bg-surface-container p-lg">
      <h2 className="text-headline-md text-on-surface">Reclaim unclaimed funds</h2>
      <p className="mt-sm max-w-2xl text-body-md text-on-surface-variant">
        This campaign expired on {expiresAt.slice(0, 10)}. Up to {outstanding} unclaimed{' '}
        {outstanding === 1 ? 'link' : 'links'} can be returned to {senderPublicKey.slice(0, 8)}…. The
        exact number comes from the ledger when you confirm, so it may be lower if someone claimed
        recently.
      </p>

      {sponsored && <p className="mt-sm text-body-md text-on-surface-variant">Kleym pays the network fee. Your wallet authorizes the USDC refund and needs no XLM top-up.</p>}

      {error && (
        <p role="alert" className="mt-md text-body-md text-error">
          {error}
        </p>
      )}

      {phase === 'confirming' ? (
        <>
          <div className="mt-md">
            <WarningPanel
              heading="The links stop working"
              consequence="Anyone still holding one of these links will not be able to claim."
            >
              Returning the funds cancels every unclaimed link in this campaign.
            </WarningPanel>
          </div>
          {stepUp.panel}
          <div className="mt-md flex flex-wrap gap-sm">
            <Button onClick={reclaim}>Reclaim</Button>
            <Button variant="tertiary" onClick={() => setPhase('idle')}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-md">
          <Button onClick={() => setPhase('confirming')} disabled={phase === 'reclaiming'}>
            {phase === 'reclaiming' ? 'Reclaiming…' : 'Reclaim'}
          </Button>
        </div>
      )}
    </section>
  )
}

/** The problem+json detail, or a plain fallback. */
/** problem+json, read once: `type` is the discriminator, `detail` is for the sender. */
async function readProblem(response: Response): Promise<{ type: string | null; detail: string }> {
  try {
    const body = (await response.json()) as { type?: string; detail?: string; title?: string }
    return {
      type: body.type ?? null,
      detail: body.detail ?? body.title ?? 'The reclaim could not be completed.',
    }
  } catch {
    return { type: null, detail: 'The reclaim could not be completed.' }
  }
}

async function detail(response: Response): Promise<string> {
  return (await readProblem(response)).detail
}
