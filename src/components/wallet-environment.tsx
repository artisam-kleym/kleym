'use client'

import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { configureLantern, lanternParentOrigin, subscribeLantern } from '@/lib/wallet/lantern'
import { lanternIntentUrl } from '@/lib/wallet/lantern-config'
import { cancelSenderConnection, configureSenderMobile, senderMobileSnapshot, subscribeSenderMobile } from '@/lib/wallet/signing'
import { subscribeWalletHandoff, walletHandoffBlocked } from '@/lib/wallet/handoff'

export function WalletEnvironment({ origins, projectId, children }: { origins: string[]; projectId: string; children: ReactNode }) {
  const href = useSyncExternalStore(subscribeLantern, () => {
    if (!origins.includes('https://android.golantern.xyz') || lanternParentOrigin() || !/android/i.test(navigator.userAgent) || location.pathname.startsWith('/claim')) return ''
    try { return lanternIntentUrl(location.href) } catch { return '' }
  }, () => '')
  const handoffBlocked = useSyncExternalStore(subscribeWalletHandoff, walletHandoffBlocked, () => false)
  const mobileLink = useSyncExternalStore(subscribeSenderMobile, senderMobileSnapshot, () => '')
  useEffect(() => {
    configureLantern(origins)
    configureSenderMobile(projectId)
  }, [origins, projectId])
  return <>
    {href && <aside className="border-b border-outline-variant bg-surface-container-low px-md py-sm text-body-md">
      {handoffBlocked ? <p role="status" data-testid="wallet-handoff-blocked">Finish Review &amp; create in this tab. Switching to Lantern opens a separate page and cannot carry your recovery phrase or link keys.</p> : <>
        <a href={href} className="font-semibold text-primary" onClick={(event) => { if (walletHandoffBlocked()) event.preventDefault() }}>Open in Lantern</a>
        <span className="ml-sm text-on-surface-variant">Recommended for campaigns. Choose Lantern before generating keys, or use Freighter in this browser.</span>
      </>}
    </aside>}
    {mobileLink && <aside className="border-b border-outline-variant px-md py-sm text-body-md" role="status">
      <a href={mobileLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-primary">Open Freighter to approve the request</a>
      <p>Return to this original tab after approval. If Freighter does not open automatically, tap the link above. Connecting your wallet does not sign or submit a batch.</p>
      {mobileLink !== 'freighterwallet://wc-redirect' && <button type="button" onClick={cancelSenderConnection} className="min-h-11 underline">Cancel connection</button>}
    </aside>}
    {children}
  </>
}
