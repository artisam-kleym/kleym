'use client'

/** Only a count is shared. Recovery phrases and link keys never leave their owner. */
let holds = 0
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())
export function subscribeWalletHandoff(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function walletHandoffBlocked() { return holds > 0 }
export function holdWalletHandoff() {
  holds += 1
  notify()
  let released = false
  return () => {
    if (released) return
    released = true
    holds -= 1
    notify()
  }
}
