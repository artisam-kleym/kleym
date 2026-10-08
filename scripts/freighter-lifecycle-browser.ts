import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit'
import { connectWallet, signEnvelope, walletErrorMessage } from '../src/lib/wallet/signing'
import { generateEphemeralKeys, type EphemeralKey } from '../src/lib/campaign/keygen'
import { buildCsv, splitCsvLine } from '../src/lib/campaign/csv'

const button = (id: string) => document.getElementById(id) as HTMLButtonElement
const status = document.getElementById('status')!
const review = document.getElementById('review')!
const saved = document.getElementById('saved') as HTMLInputElement
const restore = document.getElementById('restore') as HTMLInputElement
const allButtons = [...document.querySelectorAll<HTMLButtonElement>('button')]
let localKeys: EphemeralKey[] = []
let state: { sender: string; recipient: string; publicKeys: string[]; receipts: Record<string, { acceptancePassed: boolean }>; fatal: boolean } | undefined
let csvDownloaded = false
let signedWorkRemains = false
let claimNeedsRecipientSignature: boolean | undefined
const unsigned: Record<string, string> = {}
const signed: Record<string, string> = {}

async function api(path: string, body?: object) {
  const response = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json', 'x-kleym-proof': 'lifecycle' }, body: JSON.stringify(body) } : { cache: 'no-store' })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'Proof request failed.')
  return result
}
function ready() {
  allButtons.forEach(b => { b.disabled = true })
  if (!state || state.fatal) return
  button('claim-sign').textContent = claimNeedsRecipientSignature === false
    ? 'Approve claim without a wallet signature' : 'Sign claim in Freighter'
  button('connect').disabled = false
  if (!state.receipts.fund) {
    button('keys').disabled = localKeys.length > 0 || state.publicKeys.length > 0
    button('download').disabled = localKeys.length !== 2
    saved.disabled = !csvDownloaded
    button('fund-prepare').disabled = !saved.checked || localKeys.length !== 2
    button('fund-sign').disabled = !unsigned.fund
    button('fund-submit').disabled = !signed.fund
  } else if (!state.receipts.materialise) {
    button('materialise').disabled = localKeys.length !== 2
  } else if (!state.receipts.claim) {
    button('claim-prepare').disabled = localKeys.length !== 2
    button('claim-sign').disabled = !unsigned.claim
    button('claim-submit').disabled = !signed.claim
  } else if (!state.receipts.reclaim) {
    button('reclaim-prepare').disabled = false
    button('reclaim-sign').disabled = !unsigned.reclaim
    button('reclaim-submit').disabled = !signed.reclaim
  }
}
async function refresh() {
  state = await api('/state')
  document.getElementById('sender')!.textContent = state!.sender
  document.getElementById('recipient')!.textContent = state!.recipient
  ready()
}
async function checkWallet(role: 'sender' | 'recipient') {
  if (StellarWalletsKit.selectedModule.productId !== 'freighter') throw new Error('Connect Freighter for this proof.')
  const { address } = await StellarWalletsKit.fetchAddress()
  if (address !== state?.[role]) throw new Error(`Select Kleym ${role === 'sender' ? 'Sender' : 'Recipient'} in Freighter and connect again.`)
  if ((await StellarWalletsKit.getNetwork()).networkPassphrase !== Networks.TESTNET) throw new Error('Select Testnet in Freighter.')
}
async function action(run: () => Promise<void>) {
  allButtons.forEach(b => { b.disabled = true })
  try { await run(); await refresh() } catch (error) {
    status.textContent = await walletErrorMessage(error)
    ready()
  }
}
function ephemeralSign(xdr: string) {
  if (localKeys.length !== 2 || localKeys[0].publicKey !== state?.publicKeys[0]) throw new Error('Restore the original test-key CSV locally before claiming.')
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET)
  if (!(tx instanceof Transaction)) throw new Error('Unexpected claim envelope.')
  tx.sign(Keypair.fromSecret(localKeys[0].secret))
  return tx.toXDR()
}
button('connect').addEventListener('click', () => void action(async () => {
  status.textContent = 'Choose Freighter and approve the public-address connection.'
  const address = await connectWallet('testnet', { walletIds: ['freighter'] })
  if (![state?.sender, state?.recipient].includes(address)) throw new Error('Select Kleym Sender or Kleym Recipient in Freighter.')
  if ((await StellarWalletsKit.getNetwork()).networkPassphrase !== Networks.TESTNET) throw new Error('Select Testnet in Freighter.')
  status.textContent = `Connected ${address === state?.sender ? 'Kleym Sender' : 'Kleym Recipient'} on Testnet. No transaction submitted.`
}))
button('keys').addEventListener('click', () => {
  localKeys = generateEphemeralKeys(2, ['claim-proof', 'reclaim-proof'], [], ['1.0000000', '1.0000000'])
  status.textContent = 'Two test keys generated locally. Download the CSV and keep it private before funding.'
  ready()
})
button('download').addEventListener('click', () => {
  const blob = new Blob([buildCsv(localKeys.map(key => ({ key, url: '' })))], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = 'kleym-testnet-lifecycle-keys.csv'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  csvDownloaded = true
  ready()
})
saved.addEventListener('change', ready)
restore.addEventListener('change', () => void action(async () => {
  if (!restore.files?.[0]) return
  const lines = (await restore.files[0].text()).split(/\r?\n/).filter(line => line.trim())
  const columns = splitCsvLine(lines[0] ?? '')
  const secretAt = columns.indexOf('secret'), publicAt = columns.indexOf('public_key'), labelAt = columns.indexOf('label')
  if (lines.length !== 3 || secretAt < 0 || publicAt < 0 || labelAt < 0) throw new Error('Choose the two-row test-key CSV generated by this page.')
  const restored: EphemeralKey[] = []
  try {
    for (let i = 0; i < 2; i++) {
      const cells = splitCsvLine(lines[i + 1])
      const pair = Keypair.fromSecret(cells[secretAt])
      if (pair.publicKey() !== cells[publicAt] || cells[labelAt] !== ['claim-proof', 'reclaim-proof'][i]) throw new Error('Mismatch')
      restored.push({ publicKey: pair.publicKey(), secret: cells[secretAt], label: cells[labelAt], amount: '1.0000000', attestation: null, code: null })
    }
    if (restored[0].publicKey === restored[1].publicKey || (state?.publicKeys.length && !restored.every((key, i) => key.publicKey === state?.publicKeys[i]))) throw new Error('Mismatch')
  } catch { throw new Error('The backup does not match this proof session. No file data was sent to the server.') }
  localKeys = restored
  csvDownloaded = true
  saved.checked = true
  status.textContent = 'Test keys restored locally. The CSV was not uploaded.'
  restore.value = ''
}))
for (const stage of ['fund', 'claim', 'reclaim']) {
  button(`${stage}-prepare`).addEventListener('click', () => void action(async () => {
    await checkWallet(stage === 'claim' ? 'recipient' : 'sender')
    if (stage === 'fund' && (!saved.checked || localKeys.length !== 2)) throw new Error('Save the test-key CSV before funding.')
    status.textContent = 'Preparing the exact Testnet transaction for review…'
    const result = await api(`/${stage}/prepare`, stage === 'fund' ? { publicKeys: localKeys.map(key => key.publicKey) } : {})
    unsigned[stage] = result.xdr
    if (stage === 'claim') claimNeedsRecipientSignature = result.review.needsRecipientSignature
    signed[stage] = ''
    await refresh()
    review.textContent = JSON.stringify(result.review, null, 2)
    status.textContent = stage === 'claim' && claimNeedsRecipientSignature === false
      ? 'Prepared. Review the public transaction details, then approve the claim.'
      : 'Prepared. Review the public transaction details, then sign in Freighter.'
  }))
  button(`${stage}-sign`).addEventListener('click', () => void action(async () => {
    const role = stage === 'claim' ? 'recipient' : 'sender'
    await checkWallet(role)
    status.textContent = stage === 'claim' && claimNeedsRecipientSignature === false
      ? 'Review this claim. The existing recipient signs no operation in this transaction.'
      : 'Review and confirm this Testnet transaction in Freighter.'
    const xdr = stage === 'claim' ? ephemeralSign(unsigned[stage]) : unsigned[stage]
    signed[stage] = stage === 'claim' && claimNeedsRecipientSignature === false
      ? xdr : await signEnvelope(xdr, 'testnet', state![role])
    await checkWallet(role)
    signedWorkRemains = true
    status.textContent = stage === 'claim' && claimNeedsRecipientSignature === false
      ? 'Claim approved locally. Click Submit to send the exact transaction to Testnet.'
      : 'Wallet signature received. Click Submit for this step to send the exact transaction to Testnet.'
  }))
  button(`${stage}-submit`).addEventListener('click', () => void action(async () => {
    await checkWallet(stage === 'claim' ? 'recipient' : 'sender')
    status.textContent = 'Submitting and verifying exact amounts, fees and reserves on Testnet…'
    const result = await api(`/${stage}/submit`, { xdr: signed[stage] })
    if (!result.acceptancePassed) throw new Error('A proof assertion failed. Stop and inspect evidence with Codex.')
    signedWorkRemains = false
    review.textContent = JSON.stringify(result, null, 2)
    status.textContent = stage === 'fund'
      ? 'Funding confirmed. Keep this tab open. Return to Codex before switching to the recipient claim.'
      : stage === 'claim' ? 'Recipient received exactly 1 USDC without an XLM top-up; temporary account removed. Return to Codex for expiry reclaim.'
      : 'Expiry reclaim confirmed: 1 USDC returned to the sender. Return to Codex to review the ledger evidence.'
  }))
}
button('materialise').addEventListener('click', () => void action(async () => {
  await checkWallet('recipient')
  status.textContent = 'Starting the deliberate claim: preparing and signing temporary-account TX1 locally…'
  const result = await api('/materialise/prepare', {})
  review.textContent = JSON.stringify(result.review, null, 2)
  const submitted = await api('/materialise/submit', { xdr: ephemeralSign(result.xdr) })
  if (!submitted.acceptancePassed) throw new Error('TX1 assertion failed. Return to Codex.')
  review.textContent = JSON.stringify(submitted, null, 2)
  status.textContent = 'Claim TX1 confirmed. Wait for the next ledger, then prepare and approve claim TX2.'
}))
window.addEventListener('beforeunload', (event) => {
  if (signedWorkRemains || (state?.receipts.fund && !state.receipts.reclaim)) { event.preventDefault(); event.returnValue = '' }
})
void refresh().then(() => {
  if (state?.receipts.reclaim) status.textContent = 'This session completed the positive funding, claim and reclaim proof. Return to Codex.'
  else if (state?.receipts.fund && localKeys.length === 0) status.textContent = 'Funded session found. Restore your test-key CSV locally to continue; do not upload it to Codex.'
}).catch(() => { status.textContent = 'The local lifecycle server is unavailable. Return to Codex.'; allButtons.forEach(b => { b.disabled = true }) })
