import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { ClaimScreen } from '@/app/(public)/claim/screens'
import { FREIGHTER_APP_LINK } from '@/lib/wallet/phone'

const address = Keypair.random().publicKey()
const action = vi.fn()
const base: ComponentProps<typeof ClaimScreen> = {
  state: 'ready', link: { amount: '1', assetCode: 'USDC', senderName: 'Sender',
    expiresAt: '2027-01-01T00:00:00Z', network: 'testnet', policy: 'open', receiveAs: [], exchangeDeposit: false },
  error: null, txHash: null, network: 'testnet', claimedAt: null, claimedBy: null,
  onConnect: action, onConnectMobile: action, onClaim: action, onRetry: action,
  otpError: null, onVerifyOtp: action, onResendOtp: action,
}
const screen = (props: Partial<typeof base>) => renderToStaticMarkup(createElement(ClaimScreen, { ...base, ...props }))

describe('device-specific claim guidance', () => {
  it.each([null, address])('desktop offers no phone option before or after connection (%s)', (connectedRecipient) => {
    const html = screen({ connectedRecipient })
    expect(html).not.toContain('claim-connect-mobile')
    expect(html).not.toContain('Change to phone wallet')
    expect(html).toContain(connectedRecipient ? 'Claim 1 USDC' : 'Connect Freighter')
  })
  it('phone connection explains the separate claim and reviewed destination', () => {
    const html = screen({ phoneBrowser: true, connectedRecipient: address })
    expect(html).toContain('Freighter connected. Your funds have not been claimed yet.')
    expect(html).toContain('Review the destination below, then tap Claim')
    expect(html).toContain(address)
    expect(html).toContain('Claim 1 USDC')
    expect(html).not.toContain('claim-connect-mobile')
    expect(action).not.toHaveBeenCalled()
  })
  it('offers a secret-free app reopen only for a published mobile signing request', () => {
    expect(screen({ phoneBrowser: true, state: 'awaiting_signature' })).not.toContain('open-freighter-approval')
    const html = screen({ phoneBrowser: true, state: 'awaiting_signature', mobileApprovalPending: true })
    expect(html).toContain(`href="${FREIGHTER_APP_LINK}"`)
    expect(html).toContain('Approve your claim in Freighter')
    expect(html).toContain('it does not send another claim request')
    expect(html).not.toContain('?uri=')
    expect(html).not.toContain('#s=')
    expect(screen({ state: 'awaiting_signature', mobileApprovalPending: true })).not.toContain('open-freighter-approval')
  })
  it('keeps Lantern primary on a phone and names its approval surface', () => {
    const ready = screen({ lanternWallet: true, phoneBrowser: true })
    expect(ready).toContain('Connect Lantern')
    expect(ready).not.toContain('claim-connect-mobile')
    expect(ready).not.toContain('Connect Freighter')
    const connected = screen({ lanternWallet: true, phoneBrowser: true, connectedRecipient: address })
    expect(connected).toContain('Lantern connected. Your funds have not been claimed yet.')
    expect(connected).toContain('review it inside Lantern')
    expect(connected).toContain(address)
    const approval = screen({ lanternWallet: true, phoneBrowser: true, state: 'awaiting_signature', mobileApprovalPending: true })
    expect(approval).toContain('Approve your claim in Lantern')
    expect(approval).not.toContain('open-freighter-approval')
    expect(action).not.toHaveBeenCalled()
  })
})
