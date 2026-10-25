/**
 * Recipient email content. BRAND.md §8.
 *
 * Plain and specific. No "crypto", no "web3", no "dApp", no exclamations —
 * this is a message about money arriving, and the register is a bank's, not a
 * launch announcement's.
 *
 * Every template is self-contained text and inline-styled HTML. No remote
 * image, no web font, no tracking pixel: an image load would tell a third
 * party that a claim email was opened, and by whom.
 */

export interface ClaimEmailInput {
  senderName: string
  amount: string
  assetCode: string
  claimUrl: string
  expiresAt: Date
  /** True when the link is gated behind a code, so the email says so. */
  otpRequired: boolean
}

const PAGE = (body: string) =>
  `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px">${body}</div>`

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The message carrying the claim link itself. */
export function claimEmail(input: ClaimEmailInput): { subject: string; text: string; html: string } {
  const date = input.expiresAt.toISOString().slice(0, 10)
  const code = input.otpRequired
    ? 'You will be asked for a six-digit code, which is sent to this address when you open the link.\n\n'
    : ''

  const subject = `${input.senderName} sent you ${input.amount} ${input.assetCode}`

  const text =
    `${input.senderName} sent you ${input.amount} ${input.assetCode}.\n\n` +
    `Claim it here:\n${input.claimUrl}\n\n` +
    code +
    `You do not need any XLM and you do not need an existing account — both are covered for you.\n\n` +
    `This link expires on ${date}. After that the funds return to the sender.\n\n` +
    `Anyone who has this link can claim it, so keep it to yourself.\n`

  const html = PAGE(
    `<p style="margin:0 0 16px">${escape(input.senderName)} sent you <strong>${escape(input.amount)} ${escape(input.assetCode)}</strong>.</p>` +
      `<p style="margin:0 0 24px"><a href="${escape(input.claimUrl)}" style="display:inline-block;background:#1a1a1a;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none">Claim it</a></p>` +
      (input.otpRequired
        ? `<p style="margin:0 0 16px">You will be asked for a six-digit code, which is sent to this address when you open the link.</p>`
        : '') +
      `<p style="margin:0 0 16px">You do not need any XLM and you do not need an existing account — both are covered for you.</p>` +
      `<p style="margin:0 0 16px">This link expires on ${date}. After that the funds return to the sender.</p>` +
      `<p style="margin:0;color:#666">Anyone who has this link can claim it, so keep it to yourself.</p>`,
  )

  return { subject, text, html }
}

export interface ReminderEmailInput {
  senderName: string
  campaignName: string
  amount: string
  assetCode: string
  expiresAt: Date
  sentAt: Date
}

/**
 * A reminder to claim (#78). NO LINK — Kleym does not have it (SPEC.md §6.5)
 * — so it says what was sent, when, and to open the original message. The
 * subject repeats the original's so a search in the inbox finds both.
 */
export function reminderEmail(input: ReminderEmailInput): { subject: string; text: string; html: string } {
  const expires = input.expiresAt.toISOString().slice(0, 10)
  const sent = input.sentAt.toISOString().slice(0, 10)
  const original = `${input.senderName} sent you ${input.amount} ${input.assetCode}`
  const subject = `Reminder: ${original} — unclaimed, expires ${expires}`
  const text =
    `On ${sent} you were sent ${input.amount} ${input.assetCode} by ${input.senderName} (${input.campaignName}), and it has not been claimed.

` +
    `To claim it, open the original message — its subject line is “${original}” — and use the link in it. ` +
    `For your safety this reminder does not repeat the link.

` +
    `It expires on ${expires}. After that the funds return to the sender.
`
  const html = PAGE(
    `<p style="margin:0 0 16px">On ${escape(sent)} you were sent <strong>${escape(input.amount)} ${escape(input.assetCode)}</strong> by ${escape(input.senderName)} (${escape(input.campaignName)}), and it has not been claimed.</p>` +
      `<p style="margin:0 0 16px">To claim it, open the original message — its subject line is “${escape(original)}” — and use the link in it. For your safety this reminder does not repeat the link.</p>` +
      `<p style="margin:0;color:#666">It expires on ${escape(expires)}. After that the funds return to the sender.</p>`,
  )
  return { subject, text, html }
}

export interface ReceiptEmailInput {
  senderName: string
  amount: string
  assetCode: string
  recipient: string
  claimedAt: Date
  transactionHash: string
  receiptId: string
  /** The receipt's exact signed bytes, its signature and the key — so the message IS the evidence. */
  canonical: string
  signature: string
  publicKey: string
}

/**
 * The recipient's copy of their signed receipt (#81). NO LINK, nothing from
 * the fragment: the claimant address and the transaction hash are what the
 * ledger shows anyone, and the receipt bytes are attached in the body so it
 * verifies with the public key alone, with no call back to Kleym.
 */
export function receiptEmail(input: ReceiptEmailInput): { subject: string; text: string; html: string } {
  const when = input.claimedAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  const subject = `Receipt: ${input.amount} ${input.assetCode} from ${input.senderName}`
  const text =
    `This is your receipt for ${input.amount} ${input.assetCode} received from ${input.senderName}.\n\n` +
    `Paid to: ${input.recipient}\nAt: ${when}\nTransaction: ${input.transactionHash}\nReceipt: ${input.receiptId}\n\n` +
    `The receipt below is signed by Kleym. Anyone can verify it with the public key alone; altering a single character makes the signature fail.\n\n` +
    `--- receipt ---\n${input.canonical}\n--- signature (ed25519 over the receipt bytes, base64) ---\n${input.signature}\n--- public key (SPKI DER, base64) ---\n${input.publicKey}\n`
  const mono = 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;word-break:break-all'
  const html = PAGE(
    `<p style="margin:0 0 16px">This is your receipt for <strong>${escape(input.amount)} ${escape(input.assetCode)}</strong> received from ${escape(input.senderName)}.</p>` +
      `<p style="margin:0 0 16px;${mono}">Paid to: ${escape(input.recipient)}<br>At: ${escape(when)}<br>Transaction: ${escape(input.transactionHash)}<br>Receipt: ${escape(input.receiptId)}</p>` +
      `<p style="margin:0 0 16px;color:#666">The receipt below is signed by Kleym. Anyone can verify it with the public key alone; altering a single character makes the signature fail.</p>` +
      `<p style="margin:0 0 8px;${mono}">${escape(input.canonical)}</p>` +
      `<p style="margin:0 0 8px;${mono}">signature: ${escape(input.signature)}</p>` +
      `<p style="margin:0;${mono}">public key: ${escape(input.publicKey)}</p>`,
  )
  return { subject, text, html }
}

/**
 * A claim ticket in Kleym's homepage palette. Email-safe tables and inline
 * styles only: Zender strips SVG/style blocks and external assets add tracking.
 * The selectable code stays contiguous for copy/autofill; no code in the subject.
 */
export function otpEmail(code: string): { subject: string; text: string; html: string } {
  if (code.length !== 6 || !/^\d{6}$/.test(code)) throw new Error('A verification email requires exactly six digits')
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
  const navy = '#354f6e'
  return {
    subject: 'Your Kleym verification code',
    text:
      `Your Kleym verification code: ${code}\n\n` +
      `Enter it in the Kleym claim page you already opened. It expires 10 minutes after your request and can be used once.\n\n` +
      `Keep the code private. You do not need to share recovery words or a wallet secret key to verify your email.\n\n` +
      `If you did not request this code, ignore this email. This message does not transfer funds.\n\nKleym · Artisam Labs\n`,
    html: `<div lang="en" style="background-color:#faf9fc;color:#1a2b3e;font-family:${font};font-size:16px;line-height:1.6;padding:24px 12px">` +
      `<div style="display:none">Your next step is ready. Verify your email in your original Kleym tab.</div>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width:560px;margin:0 auto;border-collapse:collapse">` +
      `<tr><td style="padding:0 8px 20px">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td style="color:${navy};font-size:28px;font-weight:750">Kleym<span style="color:#3fa07a">.</span></td>` +
      `<td align="right" style="color:#4d6787;font-size:12px">A prize for everyone.<br>A link for each.</td>` +
      `</tr></table></td></tr>` +
      `<tr><td style="background-color:#ffffff;border:1px solid #dce3e9;border-radius:12px">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
      `<tr><td style="background-color:#e2f5ec;padding:24px 20px">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td style="color:#126b51;font-size:13px;font-weight:600">Just for your claim</td>` +
      `<td align="right" width="66">` +
      `<table role="presentation" width="48" cellpadding="0" cellspacing="0" border="0" style="border:2px solid ${navy};border-radius:4px"><tr>` +
      `<td width="19" height="17" style="background-color:#fff0bb"></td><td width="10" style="background-color:#f7c9df"></td><td width="19" style="background-color:#fff0bb"></td>` +
      `</tr><tr><td colspan="3" height="7" style="background-color:#f7c9df"></td></tr><tr>` +
      `<td height="17" style="background-color:#fff0bb"></td><td style="background-color:#f7c9df"></td><td style="background-color:#fff0bb"></td>` +
      `</tr></table></td></tr></table>` +
      `<h1 style="margin:16px 0 0;color:#1a2b3e;font-size:32px;line-height:1.15;font-weight:750">Your prize.<br>One code closer.</h1>` +
      `</td></tr>` +
      `<tr><td style="padding:24px 20px 20px">` +
      `<p style="margin:0 0 20px;color:#43474d">Enter this code in the Kleym claim page you already opened to verify your email.</p>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${navy};border-radius:8px"><tr><td align="center" style="padding:20px 8px">` +
      `<p style="margin:0;color:#d3e5ff;font-size:13px">Your verification code</p>` +
      `<p style="margin:8px 0 0;color:#ffffff;font-family:Consolas,'Liberation Mono',Menlo,monospace;font-size:48px;line-height:1.2;font-weight:700"><code style="font-family:Consolas,'Liberation Mono',Menlo,monospace">${code}</code></p>` +
      `</td></tr></table>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 20px"><tr>` +
      `<td style="background-color:#fff0bb;padding:10px 12px;color:#5e4900;font-size:13px;border-radius:4px">Expires 10 minutes after your request</td>` +
      `<td width="8"></td><td width="72" align="center" style="background-color:#e2f5ec;padding:10px 8px;color:#126b51;font-size:13px;border-radius:4px">Use once</td>` +
      `</tr></table>` +
      `<p style="margin:0;color:#1a2b3e;font-size:14px;font-weight:600">Keep this code between you and Kleym.</p>` +
      `<p style="margin:6px 0 0;color:#43474d;font-size:13px">You do not need to share recovery words or a wallet secret key to verify your email.</p>` +
      `</td></tr>` +
      `<tr><td style="padding:0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td height="1" style="background-color:#dce3e9"></td></tr></table></td></tr>` +
      `<tr><td style="padding:18px 20px 24px;color:#596576;font-size:12px">Didn't request a code? You can ignore this email. This message does not transfer funds.</td></tr>` +
      `</table></td></tr>` +
      `<tr><td style="padding:20px 8px 0;color:#596576;font-size:12px;text-align:center">Return to your original claim tab to continue.<br><strong style="color:${navy}">Kleym</strong> &nbsp;·&nbsp; Artisam Labs</td></tr>` +
      `</table></div>`,
  }
}
