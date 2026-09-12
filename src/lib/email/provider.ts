/**
 * The mail provider. SPEC.md §8.
 *
 * Resend over plain `fetch` rather than the SDK: the only call this system
 * makes is "send one message", and a dependency that ships its own retry and
 * telemetry is more surface than that is worth on the one path a claim URL
 * travels.
 *
 * No analytics pixel, no click tracking, no open tracking. A pixel in a claim
 * email would leak the URL's existence and the recipient's read to a third
 * party (SPEC.md §8), which is the opposite of what this product promises.
 */
import { env } from '@/lib/config/env'

export interface Message {
  to: string
  subject: string
  text: string
  html: string
}

export type Mailer = (message: Message) => Promise<{ id: string }>

/**
 * Sends through Resend.
 *
 * Tracking is disabled EXPLICITLY rather than relied upon to be off by
 * default: a provider changing its default would silently start pixelling
 * every claim email, and nothing in this codebase would notice.
 */
export const resend: Mailer = async (message) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      // Resend's names for open-pixel and link-rewriting.
      track_opens: false,
      track_clicks: false,
    }),
  })

  if (!response.ok) {
    /*
     * The provider's body is read for a reason, not echoed anywhere.
     *
     * It is thrown so BullMQ can retry on it, and the worker logs only the
     * status — a provider that echoes the request back would otherwise put the
     * claim URL into a log line (AGENT.md §4.5).
     */
    throw new Error(`mail provider rejected the message (${response.status})`)
  }

  const body = (await response.json()) as { id?: string }
  return { id: body.id ?? 'unknown' }
}
