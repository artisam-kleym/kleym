import { connectWallet, signEnvelope, walletErrorMessage } from '../src/lib/wallet/signing'
import { FreighterDesktop } from '../src/lib/wallet/desktop'
const desktop = new FreighterDesktop()

const connect = document.querySelector<HTMLButtonElement>('#connect')!
const prepare = document.querySelector<HTMLButtonElement>('#prepare')!
const sign = document.querySelector<HTMLButtonElement>('#sign')!
const submit = document.querySelector<HTMLButtonElement>('#submit')!
const status = document.querySelector<HTMLElement>('#status')!
const review = document.querySelector<HTMLElement>('#review')!
let expectedTarget = ''
let targetLabel = 'sender'
let walletLabel = 'Kleym Sender'
let setupConfirmedMessage = ''
let unsignedXdr = ''
let signedXdr = ''

async function api(path: string, body?: object) {
  const response = await fetch(path, body ? {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-kleym-proof': 'bootstrap' },
    body: JSON.stringify(body),
  } : { cache: 'no-store' })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'The proof request failed.')
  return result
}

async function checkWallet() {
  const { address } = await desktop.getAddress({ skipRequestAccess: true })
  if (address !== expectedTarget) throw new Error(`Select ${walletLabel} in Freighter, then connect again.`)
  const { networkPassphrase } = await desktop.getNetwork()
  if (networkPassphrase !== 'Test SDF Network ; September 2015') throw new Error('Select Testnet in Freighter.')
}

async function action(button: HTMLButtonElement, run: () => Promise<void>) {
  const buttons = [connect, prepare, sign, submit]
  const previous = buttons.map((b) => b.disabled)
  buttons.forEach((b) => { b.disabled = true })
  try { await run() } catch (error) {
    status.textContent = await walletErrorMessage(error)
    buttons.forEach((b, i) => { b.disabled = previous[i] })
    button.disabled = false
  }
}

connect.addEventListener('click', () => void action(connect, async () => {
  status.textContent = 'Choose Freighter and allow this local page to read your public address.'
  await connectWallet('testnet', { walletIds: ['freighter'] })
  await checkWallet()
  status.textContent = 'Wallet connected on Testnet. Connecting submitted no transaction.'
  connect.disabled = false
  prepare.disabled = false
}))

prepare.addEventListener('click', () => void action(prepare, async () => {
  await checkWallet()
  status.textContent = `Preparing an isolated Testnet sponsor and ${targetLabel} transaction...`
  const result = await api('/prepare', {})
  unsignedXdr = result.xdr
  signedXdr = ''
  review.textContent = JSON.stringify(result.review, null, 2)
  status.textContent = `Review the ${result.review.operations.length} operations below. Your ${targetLabel} account has not been created yet.`
  connect.disabled = false
  prepare.disabled = false
  sign.disabled = false
}))

sign.addEventListener('click', () => void action(sign, async () => {
  await checkWallet()
  status.textContent = `Review and approve the ${targetLabel} setup in Freighter.`
  signedXdr = await signEnvelope(unsignedXdr, 'testnet', expectedTarget)
  await checkWallet()
  status.textContent = `Wallet signature received. Click Submit ${targetLabel} setup to send this exact transaction to Testnet.`
  connect.disabled = false
  sign.disabled = false
  submit.disabled = false
}))

submit.addEventListener('click', () => void action(submit, async () => {
  await checkWallet()
  status.textContent = 'Submitting and independently checking Testnet settlement…'
  const result = await api('/submit', { xdr: signedXdr })
  if (result.acceptancePassed !== true) throw new Error('Setup assertions did not pass. Stop and inspect the receipt with Codex.')
  review.textContent = JSON.stringify(result, null, 2)
  status.textContent = setupConfirmedMessage
}))

void api('/status').then((result) => {
  expectedTarget = result.target ?? result.sender
  targetLabel = result.targetLabel ?? 'sender'
  walletLabel = result.walletLabel ?? 'Kleym Sender'
  setupConfirmedMessage = result.mode === 'recipient-account-only'
    ? 'Recipient setup confirmed: zero XLM and no USDC trustline, with sponsored account reserves. Return to Codex before funding and claim.'
    : 'Sender setup confirmed: zero XLM, sponsored account and USDC trustline. Keep the recipient unfunded. Return to Codex for the test-USDC step.'
  document.querySelector<HTMLElement>('#sender')!.textContent = result.sender
  document.querySelector<HTMLElement>('#recipient')!.textContent = result.recipient
  if (result.receipt) {
    review.textContent = JSON.stringify(result.receipt, null, 2)
    status.textContent = result.receipt.acceptancePassed === true
      ? setupConfirmedMessage
      : 'A transaction confirmed but setup assertions failed. Stop and inspect the receipt with Codex.'
    connect.disabled = true
  }
}).catch(() => { status.textContent = 'The local proof server is unavailable. Return to Codex.'; connect.disabled = true })
