import { connectWallet, signEnvelope, walletErrorMessage } from '../src/lib/wallet/signing'
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit'

const connect = document.querySelector<HTMLButtonElement>('#connect')!
const prepare = document.querySelector<HTMLButtonElement>('#prepare')!
const sign = document.querySelector<HTMLButtonElement>('#sign')!
const submit = document.querySelector<HTMLButtonElement>('#submit')!
const status = document.querySelector<HTMLElement>('#status')!
const review = document.querySelector<HTMLElement>('#review')!
let expectedSender = ''
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
  if (StellarWalletsKit.selectedModule.productId !== 'freighter') throw new Error('Choose Freighter for this proof.')
  const { address } = await StellarWalletsKit.fetchAddress()
  if (address !== expectedSender) throw new Error('Select Kleym Sender in Freighter, then connect again.')
  const { networkPassphrase } = await StellarWalletsKit.getNetwork()
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
  status.textContent = 'Sender connected on Testnet. Connecting submitted no transaction.'
  connect.disabled = false
  prepare.disabled = false
}))

prepare.addEventListener('click', () => void action(prepare, async () => {
  await checkWallet()
  status.textContent = 'Preparing an isolated Testnet sponsor and sender transaction…'
  const result = await api('/prepare', {})
  unsignedXdr = result.xdr
  signedXdr = ''
  review.textContent = JSON.stringify(result.review, null, 2)
  status.textContent = 'Review the four operations below. Your sender account has not been created yet.'
  connect.disabled = false
  prepare.disabled = false
  sign.disabled = false
}))

sign.addEventListener('click', () => void action(sign, async () => {
  await checkWallet()
  status.textContent = 'Review and approve the sender setup in Freighter.'
  signedXdr = await signEnvelope(unsignedXdr, 'testnet', expectedSender)
  await checkWallet()
  status.textContent = 'Wallet signature received. Click Submit sender setup to send this exact transaction to Testnet.'
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
  status.textContent = 'Sender setup confirmed: zero XLM, sponsored account and USDC trustline. Keep the recipient unfunded. Return to Codex for the test-USDC step.'
}))

void api('/status').then((result) => {
  expectedSender = result.sender
  document.querySelector<HTMLElement>('#sender')!.textContent = result.sender
  document.querySelector<HTMLElement>('#recipient')!.textContent = result.recipient
  if (result.receipt) {
    review.textContent = JSON.stringify(result.receipt, null, 2)
    status.textContent = result.receipt.acceptancePassed === true
      ? 'This session already confirmed sender setup. Return to Codex for the test-USDC step.'
      : 'A transaction confirmed but setup assertions failed. Stop and inspect the receipt with Codex.'
    connect.disabled = true
  }
}).catch(() => { status.textContent = 'The local proof server is unavailable. Return to Codex.'; connect.disabled = true })
