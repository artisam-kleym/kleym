'use client'

import { stellarMetadata, type StellarNetwork } from '@/lib/stellar/network'
import type { NetworkWorkspaces } from '@/lib/stellar/network-workspaces'

/** Open a fresh workspace; never transfer drafts, phrases, keys, queries or sessions. */
export function NetworkPicker({ network, workspaces }: { network: StellarNetwork; workspaces?: NetworkWorkspaces }) {
  const other: StellarNetwork = network === 'testnet' ? 'public' : 'testnet'
  const otherName = other === 'public' ? 'Mainnet' : 'Testnet'
  const destination = workspaces?.[other]
  return <fieldset className="flex flex-col gap-xs">
    <legend className="font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">Network</legend>
    <div className="flex flex-wrap gap-sm" aria-label="Campaign network">
      <button type="button" aria-pressed="true" className="min-h-11 rounded-lg border border-primary bg-primary/10 px-md py-sm font-semibold text-primary">
        {network === 'testnet' ? 'Testnet · test funds' : 'Mainnet · real assets'}
      </button>
      {destination
        ? <a href={`${destination}/campaigns/new`} target="_blank" rel="noopener noreferrer" className="min-h-11 rounded-lg border border-outline px-md py-sm text-on-surface">Open {otherName} ↗</a>
        : <button type="button" disabled className="min-h-11 rounded-lg border border-outline-variant px-md py-sm text-on-surface-variant opacity-50">{otherName} · unavailable</button>}
    </div>
    <p className="font-mono text-label-sm text-on-surface-variant">
      <span>{stellarMetadata(network).valueNotice}</span>{' '}
      {destination ? 'The other network opens in a new tab with its own sign-in and campaign. Your current draft stays here.' : `${otherName} will be available after its separate workspace is configured.`}
    </p>
  </fieldset>
}
