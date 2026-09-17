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

/** The six-digit code. Deliberately terse — it exists to be read and typed. */
export function otpEmail(code: string): { subject: string; text: string; html: string } {
  return {
    subject: `${code} is your Kleym code`,
    text:
      `${code} is the code to claim your funds.\n\n` +
      `It expires in 10 minutes. If you did not open a claim link, ignore this message.\n`,
    html: PAGE(
      `<p style="margin:0 0 16px">Your code to claim:</p>` +
        `<p style="margin:0 0 24px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;letter-spacing:6px"><strong>${escape(code)}</strong></p>` +
        `<p style="margin:0;color:#666">It expires in 10 minutes. If you did not open a claim link, ignore this message.</p>`,
    ),
  }
}
