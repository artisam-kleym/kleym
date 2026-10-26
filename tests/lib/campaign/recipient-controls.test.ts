import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('client-only', () => ({}))
import { RecipientsStep } from '@/app/(sender)/campaigns/new/steps'

const base: ComponentProps<typeof RecipientsStep> = {
  draft: { linkCount: 1, expiresAt: '2026-12-01T00:00:00Z' },
  onChange: () => {}, labels: [], amounts: [], defaultAmount: '1', assetCode: 'USDC',
  onAmount: () => {}, onResetAmounts: () => {}, labelError: null, onLabels: () => {},
  reminderDays: [], onReminderDays: () => {}, claimPolicy: 'open', onClaimPolicy: () => {},
  onEmailImport: () => {}, onWalletImport: () => {}, onWalletPending: () => {},
  cost: null, reserveSource: null, maxLinks: 10000, maxOpsPerBatch: 90, affordable: null,
  expiryChoice: 'custom', expiryError: null, onExpiry: () => {},
}
const render = (props: Partial<typeof base> = {}) => renderToStaticMarkup(createElement(RecipientsStep, { ...base, ...props }))
describe('recipient setup controls', () => {
  it('offers no unavailable reminder action in local-link delivery', () => {
    expect(render()).not.toContain('name="reminderDays"')
  })
  it('does not promise on-chain passkey protection for a leaked private link', () => {
    const html = render()
    expect(html).not.toContain('A copy made afterwards is useless')
    expect(html).toContain('not an extra Stellar signing requirement')
  })
  it('keeps historical reminder controls available only for the qualified legacy mode', () => {
    expect(render({ reminderAvailable: true })).toContain('name="reminderDays"')
    expect(render({ reminderAvailable: true, claimPolicy: 'email' })).not.toContain('name="reminderDays"')
  })
})
