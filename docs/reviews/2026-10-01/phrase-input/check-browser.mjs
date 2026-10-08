// Keeps generated fixture words only in page memory; no screenshots or traces.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ storageState: 'e2e/.auth/session.json' })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:3220/campaigns/new')
  await page.getByLabel('Campaign name').fill('Phrase input probe')
  await page.getByLabel('Funding account').fill('GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A')
  await page.getByLabel('Amount per link').fill('1')
  await page.getByTestId('next-step').click()
  await page.getByLabel('Number of links').fill('2')
  await page.getByTestId('next-step').click()
  await page.getByTestId('phrase-new').click()
  // The fixture is not returned to Node or written to an artifact.
  await page.evaluate(() => {
    window.__fixtureWords = [...document.querySelectorAll('[data-testid="phrase-words"] li')]
      .map((li) => li.textContent.replace(/^\d+\.\s*/, '').trim())
  })
  await page.getByRole('button', { name: 'Start over', exact: true }).click()
  await page.getByTestId('phrase-existing').click()
  await page.getByTestId('phrase-understood').check()
  async function paste(mode) {
    await page.getByTestId('phrase-input').evaluate((element, mode) => {
      const words = window.__fixtureWords
      let text = mode === 'numbered' ? words.map((word, i) => `${i + 1}. ${word}`).join('\n') : words.join(' ')
      if (mode === 'invisible') text = text.replaceAll(' ', '\u200b\u00a0')
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(element, text)
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }, mode)
    await page.waitForTimeout(100)
    return page.getByTestId('phrase-confirm').isEnabled()
  }
  const proof = { checkedAt: new Date().toISOString(), plainAccepted: await paste('plain'),
    numberedAccepted: await paste('numbered'), invisibleSpacingAccepted: await paste('invisible'),
    noKeysGenerated: true, noCampaignCreated: true, noSignature: true, noChainWrites: true }
  const phase = process.argv[2] ?? 'before'
  if (!proof.plainAccepted) throw new Error('Generated plain phrase failed validation')
  if (phase === 'before' && (proof.numberedAccepted || proof.invisibleSpacingAccepted)) throw new Error('Formatting defect was not reproduced')
  if (phase === 'after' && (!proof.numberedAccepted || !proof.invisibleSpacingAccepted)) throw new Error('Formatting fix failed')
  if (phase === 'after') {
    await page.getByTestId('phrase-input').fill('abandon '.repeat(12)) // Public invalid checksum fixture.
    await page.getByText('All words are recognized, but the phrase fails its recovery check.', { exact: false }).waitFor()
    if (await page.getByTestId('phrase-confirm').isEnabled()) throw new Error('Invalid checksum was accepted')
    await page.getByTestId('phrase-input').fill('notaword ' + 'abandon '.repeat(11))
    await page.getByText('Some entries are not English recovery words.', { exact: false }).waitFor()
    await page.getByTestId('phrase-input').fill('abandon '.repeat(11))
    await page.getByText('11 words detected', { exact: true }).waitFor()
    proof.countSpellingAndChecksumDiagnostics = true
  }
  fs.writeFileSync(`docs/reviews/2026-10-01/phrase-input/${phase}.json`, JSON.stringify(proof, null, 2) + '\n')
  console.log(JSON.stringify(proof))
} finally { await browser.close() }
