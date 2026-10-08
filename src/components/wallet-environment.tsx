'use client'

import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { configureLantern, lanternParentOrigin, subscribeLantern } from '@/lib/wallet/lantern'
import { lanternIntentUrl } from '@/lib/wallet/lantern-config'
import { cancelSenderConnection, configureSenderMobile, senderMobileSnapshot, subscribeSenderMobile } from '@/lib/wallet/signing'

export function WalletEnvironment({ origins, projectId, children }: { origins: string[]; projectId: string; children: ReactNode }) {
  const href = useSyncExternalStore(subscribeLantern, () => {
    if (!origins.length || lanternParentOrigin() || !/android/i.test(navigator.userAgent) || location.pathname.startsWith('/claim')) return ''
    try { return lanternIntentUrl(location.href) } catch { return '' }
  }, () => '')
  const mobileLink = useSyncExternalStore(subscribeSenderMobile, senderMobileSnapshot, () => '')
  useEffect(() => {
    configureLantern(origins)
    configureSenderMobile(projectId)
  }, [origins, projectId])
  return <>
    {href && <aside className="border-b border-outline-variant bg-surface-container-low px-md py-sm text-body-md">
      <a href={href} className="font-semibold text-primary">Open in Lantern</a>
      <span className="ml-sm text-on-surface-variant">Create and manage campaigns in your wallet. Freighter remains available in this browser.</span>
    </aside>}
    {mobileLink && <aside className="border-b border-outline-variant px-md py-sm text-body-md" role="status">
      <a href={mobileLink} className="font-semibold text-primary">Open Freighter to approve the request</a>
      <p>Keep this tab open and return after approval. Opening the wallet does not submit funds.</p>
      {mobileLink !== 'freighterwallet://wc-redirect' && <button type="button" onClick={cancelSenderConnection} className="min-h-11 underline">Cancel connection</button>}
    </aside>}
    {children}
  </>
}
