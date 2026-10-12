'use client'

import { useSyncExternalStore } from 'react'

const subscribe = (notify: () => void) => {
  const timer = setInterval(notify, 1_000)
  window.addEventListener('focus', notify)
  return () => { clearInterval(timer); window.removeEventListener('focus', notify) }
}

/** UI availability only. The server and ledger still enforce the actual predicate. */
export function useExpired(expiresAt: string, serverExpired: boolean): boolean {
  return useSyncExternalStore(subscribe,
    () => serverExpired || Date.now() >= new Date(expiresAt).getTime(),
    () => serverExpired)
}

const subscribeLocalTime = (notify: () => void) => {
  window.addEventListener('focus', notify)
  return () => window.removeEventListener('focus', notify)
}

/** The first client render matches UTC HTML; localization follows hydration. */
export function useExpiryTime(expiresAt: string): string {
  const date = new Date(expiresAt)
  return useSyncExternalStore(subscribeLocalTime,
    () => date.toLocaleString(undefined, { timeZoneName: 'short' }),
    () => `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`)
}
